const SIDEBAR_PLACEHOLDER_TITLE = 'New Chat';

const LOCAL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

interface SidebarConversationLabelInput {
  title?: string;
  createdAt?: number;
  updatedAt?: number;
}

const getTimestampOrNow = (timestamp?: number): number =>
  Number.isFinite(timestamp) ? (timestamp as number) : Date.now();

export const formatLocalDateTime = (timestamp: number): string => {
  const resolvedTimestamp = getTimestampOrNow(timestamp);
  const parts = LOCAL_DATE_TIME_FORMATTER.formatToParts(resolvedTimestamp);

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';

  return `${year}-${month}-${day} ${hour}:${minute}`;
};

/** @deprecated Use formatLocalDateTime instead. Kept for backward compatibility. */
export const formatIstDateTime = formatLocalDateTime;

export const getSidebarConversationLabel = (
  conversation: SidebarConversationLabelInput
): string => {
  const title = conversation.title?.trim();

  if (title && title !== SIDEBAR_PLACEHOLDER_TITLE) {
    return title;
  }

  const timestamp = conversation.createdAt ?? conversation.updatedAt;
  return formatLocalDateTime(getTimestampOrNow(timestamp));
};

export const getSidebarNewChatCtaLabel = (timestamp: number = Date.now()): string =>
  formatLocalDateTime(timestamp);
