export type SalesRow = any;
export type Influencer = any;
export type Campaign = any;
export type Task = any;
export type Message = any;
export type Contract = any;
export type BillingEntry = any;
export type MonthlyBudget = any;
export type ProductConfig = any;
export type SampleDetail = any;
export type Note = any;
export type NotebookChatMessage = any;
export type AovEntry = any;
export type RegisteredUser = any;
export type UserActivityLog = any;
export type GlobalSettings = any;

export interface ImportantLink {
  id: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  pinned?: boolean;
  color?: string;
  createdAt: string;
}
