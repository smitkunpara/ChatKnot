export type ToolFailureCode =
  | 'TOOL_NOT_FOUND'
  | 'TOOL_DISABLED'
  | 'TOOL_PERMISSION_DENIED';

export const formatToolFailureMessage = (
  code: ToolFailureCode,
  toolName: string
): string => {
  switch (code) {
    case 'TOOL_NOT_FOUND':
      return `Tool "${toolName}" is not available. Check MCP server connection or tool name.`;
    case 'TOOL_DISABLED':
      return `Tool "${toolName}" is disabled in MCP settings.`;
    case 'TOOL_PERMISSION_DENIED':
      return `User denied permission for tool "${toolName}".`;
    default:
      return `Tool "${toolName}" failed.`;
  }
};

export const serializeToolFailurePayload = (
  code: ToolFailureCode,
  toolName: string,
  message: string
): string => {
  return JSON.stringify(
    {
      error: code,
      tool: toolName,
      message,
    },
    null,
    2
  );
};
