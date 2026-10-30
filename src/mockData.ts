import { Influencer, Campaign, Task, Message, Contract, BillingEntry } from './types';
import defaultData from './initialData.json';

export const INITIAL_INFLUENCERS: Influencer[] = (defaultData.influencers || []) as Influencer[];
export const INITIAL_CAMPAIGNS: Campaign[] = (defaultData.campaigns || []) as Campaign[];
export const INITIAL_TASKS: Task[] = (defaultData.tasks || []) as Task[];
export const INITIAL_MESSAGES: Message[] = (defaultData.messages || []) as Message[];
export const INITIAL_CONTRACTS: Contract[] = (defaultData.contracts || []) as Contract[];
export const INITIAL_BILLING: BillingEntry[] = (defaultData.billingEntries || []) as BillingEntry[];

export const BENCHMARKS = {
  monthlyComparison: [],
  nichePerformance: []
};

