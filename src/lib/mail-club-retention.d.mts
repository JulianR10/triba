export interface MailClubRetentionSubscription {
  status: string;
  current_period_end: string | null;
}

export function shouldRetainMailClubAddress(
  subscriptions: MailClubRetentionSubscription[],
  now?: Date | number,
): boolean;
