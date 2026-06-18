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
export declare class PreferenceExtractor {
    private llmModel;
    private llmUrl;
    private readonly triggerKeywords;
    constructor(llmUrl?: string);
    /**
     * 从对话中提取用户偏好
     * @param userMessage 用户的最新消息
     * @param agentMessage Agent 对应的回复
     * @returns 提取到的偏好列表，如果没有偏好则返回空数组
     */
    extract(userMessage: string, agentMessage: string): Promise<Preference[]>;
    /**
     * 批量提取：从一整天的对话日志中提取所有偏好
     * @param conversationText 一整天的对话文本
     * @returns 提取到的偏好列表
     */
    extractBatch(conversationText: string): Promise<Preference[]>;
    /**
     * 智能获取可用的模型名称
     * 优先级：环境变量 > openclaw.json > 自动探测 LLM 服务端 > 兜底
     */
    private resolveModel;
    /**
     * 构建发送给 LLM 的分析 Prompt
     */
    private buildExtractionPrompt;
    /**
     * 调用 LLM API（兼容任何 OpenAI 兼容服务端）
     */
    private callLLM;
    /**
     * 解析 LLM 返回的 JSON 响应
     * 能处理纯 JSON、JSON 数组、以及嵌在文本中的 JSON
     */
    private parseResponse;
}
//# sourceMappingURL=preference-extractor.d.ts.map