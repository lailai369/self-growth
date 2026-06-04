import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * 用户偏好数据结构
 */
export interface Preference {
  text: string;
  type: 'preference' | 'habit' | 'fact' | 'decision';
  source: string;
}

/**
 * 用户偏好提取器
 * 职责：只负责从对话文本中提取结构化的偏好数据。
 * 不负责存储——存储逻辑交给 MemoryManager 处理。
 * 模型自动识别：环境变量 > openclaw.json > 自动探测 LLM 服务端 > 兜底。
 */
export class PreferenceExtractor {
  private llmModel: string = '';
  private llmUrl: string;

  // 触发偏好提取的关键词
  private readonly triggerKeywords = [
    '喜欢', '讨厌', '习惯', '以后', '记住', '不要',
    '总是', '用这个', '改成', '偏好', '我不喜欢',
    '下次', '每次都', '一直用', '改一下'
  ];

  constructor(llmUrl: string = 'http://127.0.0.1:1234/v1') {
    this.llmUrl = llmUrl;
    // 异步初始化模型名称，不阻塞构造函数
    this.resolveModel().then(model => {
      this.llmModel = model;
    });
  }

  /**
   * 从对话中提取用户偏好
   * @param userMessage 用户的最新消息
   * @param agentMessage Agent 对应的回复
   * @returns 提取到的偏好列表，如果没有偏好则返回空数组
   */
  async extract(userMessage: string, agentMessage: string): Promise<Preference[]> {
    // 1. 关键词预过滤：避免无意义的 LLM 调用
    const hasTrigger = this.triggerKeywords.some(keyword =>
      userMessage.includes(keyword)
    );
    if (!hasTrigger) return [];

    // 2. 确保模型已经初始化
    if (!this.llmModel) {
      await this.resolveModel();
    }

    console.log('[PreferenceExtractor] 🔍 检测到潜在的偏好表达，正在分析...');

    // 3. 构造提取 Prompt
    const prompt = this.buildExtractionPrompt(userMessage, agentMessage);

    try {
      const response = await this.callLLM(prompt);
      const preferences = this.parseResponse(response);
      return preferences;
    } catch (error) {
      console.error('[PreferenceExtractor] ❌ 偏好提取失败:', error);
      return [];
    }
  }

  /**
   * 批量提取：从一整天的对话日志中提取所有偏好
   * @param conversationText 一整天的对话文本
   * @returns 提取到的偏好列表
   */
  async extractBatch(conversationText: string): Promise<Preference[]> {
    if (!this.llmModel) {
      await this.resolveModel();
    }

    const prompt = `分析以下对话，从中提取所有重要的用户偏好、习惯和事实。
以 JSON 列表格式返回，每条记忆包含三个字段：
- text: 记忆内容（一句话）
- type: 类型，可选值：preference（偏好）、habit（习惯）、fact（事实）、decision（决定）
- source: 来源（对话摘要）

对话内容：
${conversationText}

只返回 JSON 列表，不要其他内容：`;

    try {
      const response = await this.callLLM(prompt);
      return this.parseResponse(response);
    } catch {
      return [];
    }
  }

  // ========== 私有方法 ==========

  /**
   * 智能获取可用的模型名称
   * 优先级：环境变量 > openclaw.json > 自动探测 LLM 服务端 > 兜底
   */
  private async resolveModel(): Promise<string> {
    // 1. 环境变量（最高优先级，用户手动指定）
    if (process.env.SELF_GROWTH_LLM_MODEL) {
      this.llmModel = process.env.SELF_GROWTH_LLM_MODEL;
      return this.llmModel;
    }

    // 2. 读取 openclaw.json 中的 primary 模型
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      const primaryModel = config?.agents?.defaults?.model?.primary;
      if (primaryModel) {
        this.llmModel = primaryModel;
        return this.llmModel;
      }
    } catch {
      // 配置文件不存在或读取失败，静默跳过
    }

    // 3. 探测 llmUrl 的 /models 端点
    // 兼容任何 OpenAI 兼容服务：LM Studio、Ollama、vLLM、text-generation-webui 等
    try {
      const response = await fetch(`${this.llmUrl}/models`);
      const data = await response.json() as any;
      // 不同服务返回的字段名可能不同，逐个尝试
      const firstModel = data?.data?.[0]?.id          // LM Studio / Ollama 格式
                      || data?.models?.[0]?.name       // vLLM 格式
                      || data?.models?.[0]?.id         // 其他格式
                      || data?.data?.[0]?.name;
      if (firstModel) {
        this.llmModel = firstModel;
        return this.llmModel;
      }
    } catch {
      // 服务端不在线或 /models 端点不可用，跳过
    }

    // 4. 最终兜底
    this.llmModel = 'default-model';
    return this.llmModel;
  }

  /**
   * 构建发送给 LLM 的分析 Prompt
   */
  private buildExtractionPrompt(userMessage: string, agentMessage: string): string {
    return `你是一个专业的用户偏好分析助手。请分析以下对话，判断用户是否表达了需要长期记忆的"个人偏好"或"习惯"。

【对话内容】
用户: ${userMessage}
Agent: ${agentMessage}

【判断标准】
1. 必须是针对未来交互的通用要求（例如："以后写代码都用中文变量名"、"我不喜欢看长篇大论"）。
2. 如果是针对当前任务的临时指令（例如："把这句话翻译成英文"），则忽略。
3. 如果确认是长期偏好，请用 JSON 格式返回，包含 text（一句话精炼总结）、type（preference/habit/fact/decision）、source（"对话记录"）。
4. 如果不是，请返回空列表 []。

【你的结论】`;
  }

  /**
   * 调用 LLM API（兼容任何 OpenAI 兼容服务端）
   */
  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.llmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 2000
        })
      });

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '[]';
    } catch (error) {
      console.error('[PreferenceExtractor] LLM 调用失败:', error);
      return '[]';
    }
  }

  /**
   * 解析 LLM 返回的 JSON 响应
   * 能处理纯 JSON、JSON 数组、以及嵌在文本中的 JSON
   */
  private parseResponse(response: string): Preference[] {
    try {
      return JSON.parse(response) as Preference[];
    } catch {
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          return JSON.parse(match[0]) as Preference[];
        } catch {
          // 解析失败，返回空
        }
      }
    }
    return [];
  }
}