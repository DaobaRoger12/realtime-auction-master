/**
 * AI 服务 —— 接入字节火山方舟 Doubao-Seed-2.0-lite（OpenAI 兼容协议）。
 *
 * 能力：
 *   1. describeProduct —— 一键生成商品标题/卖点文案 + 智能推荐竞拍规则
 *   2. commentary      —— 主播话术（开场/出价/临近结束/成交），营造竞价氛围
 *
 * 设计：所有 AI 调用都有「模板兜底」，即使 KEY 失效或网络异常，
 *       接口依然返回可用内容，保证演示与生产链路不被第三方拖垮。
 */
import { env } from '../config/env.js';
import { logger } from '../infra/logger.js';
import { yuanToFen } from '@auction/shared';
import type { AiDescribeResponse, AuctionRules } from '@auction/shared';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 低层 Chat Completion 调用（带超时与错误兜底） */
async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string | null> {
  if (!env.ai.enabled || !env.ai.apiKey || !env.ai.model) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  try {
    const resp = await fetch(`${env.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 800,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.warn({ status: resp.status, text: text.slice(0, 200) }, 'AI 调用非 2xx');
      return null;
    }
    const data: any = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'AI 调用异常，使用兜底');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 从模型输出中尽力抽取 JSON 对象 */
function extractJson(text: string): any | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export const aiService = {
  available(): boolean {
    return env.ai.enabled && !!env.ai.apiKey && !!env.ai.model;
  },

  /** 生成商品文案 + 推荐规则 */
  async describeProduct(input: {
    title: string;
    category: string;
    keywords?: string;
  }): Promise<AiDescribeResponse> {
    const sys: ChatMessage = {
      role: 'system',
      content:
        '你是抖音电商直播竞拍平台的资深运营，擅长为珠宝、艺术品、二手奢侈品等高价值商品撰写' +
        '极具吸引力的卖点文案，并基于品类给出合理的竞拍规则建议。务必只返回 JSON。',
    };
    const user: ChatMessage = {
      role: 'user',
      content:
        `商品名称：${input.title}\n品类：${input.category}\n` +
        `卖点关键词：${input.keywords || '无'}\n\n` +
        '请输出 JSON，字段：\n' +
        'title(优化后的标题, <=24字), ' +
        'description(120-200字的卖点文案, 含材质/工艺/稀缺性/适用场景), ' +
        'startPriceYuan(建议起拍价,元), incrementYuan(建议加价幅度,元), ' +
        'capPriceYuan(建议封顶价,元), durationSec(建议时长,秒,120-600)。',
    };
    const out = await chat([sys, user], { temperature: 0.85, maxTokens: 700 });
    const json = out ? extractJson(out) : null;

    if (json && json.description) {
      const suggestedRules: Partial<AuctionRules> = {};
      if (json.startPriceYuan != null) suggestedRules.startPrice = yuanToFen(Number(json.startPriceYuan));
      if (json.incrementYuan != null) suggestedRules.bidIncrement = yuanToFen(Number(json.incrementYuan));
      if (json.capPriceYuan != null) suggestedRules.capPrice = yuanToFen(Number(json.capPriceYuan));
      if (json.durationSec != null) suggestedRules.durationSec = Number(json.durationSec);
      return {
        title: String(json.title || input.title).slice(0, 24),
        description: String(json.description),
        suggestedRules,
      };
    }
    return this.fallbackDescribe(input);
  },

  /** 主播话术 */
  async commentary(input: {
    scene: 'open' | 'bid' | 'ending' | 'sold';
    context?: Record<string, unknown>;
  }): Promise<string> {
    const sceneText: Record<string, string> = {
      open: '竞拍开场预热',
      bid: '有人出价后的加价鼓动',
      ending: '临近结束的紧张催价',
      sold: '成交时的恭喜与收尾',
    };
    const sys: ChatMessage = {
      role: 'system',
      content:
        '你是抖音直播间金牌拍卖师，语言热情、有节奏感、有感染力，' +
        '善于用一两句话点燃竞价氛围。只输出一句话，不超过40字，不要加引号。',
    };
    const user: ChatMessage = {
      role: 'user',
      content:
        `场景：${sceneText[input.scene]}\n` +
        `上下文：${JSON.stringify(input.context ?? {})}\n请给出一句拍卖师话术。`,
    };
    const out = await chat([sys, user], { temperature: 0.95, maxTokens: 80 });
    return out ? out.replace(/^["'“”]|["'“”]$/g, '') : this.fallbackCommentary(input.scene);
  },

  /* ----------------------------- 兜底模板 ----------------------------- */
  fallbackDescribe(input: { title: string; category: string }): AiDescribeResponse {
    return {
      title: input.title,
      description:
        `【${input.category}】${input.title}，臻选好物，品相上乘，细节考究，存世稀少。` +
        `直播间专享竞拍，价高者得，机会难得，错过不再，速来出价！`,
      suggestedRules: {
        startPrice: yuanToFen(1),
        bidIncrement: yuanToFen(50),
        capPrice: yuanToFen(9999),
        durationSec: 300,
      },
    };
  },

  fallbackCommentary(scene: 'open' | 'bid' | 'ending' | 'sold'): string {
    const pool: Record<string, string[]> = {
      open: ['宝贝上架，0元起拍，手快有手慢无，出价就有机会带走！'],
      bid: ['有人加价啦！想要的家人们别犹豫，再加一口稳稳领先！'],
      ending: ['最后10秒！还有谁？再不出手就是别人的了！'],
      sold: ['恭喜这位家人成功拿下，眼光独到，恭喜恭喜！'],
    };
    const arr = pool[scene];
    return arr[Math.floor(Math.random() * arr.length)];
  },
};
