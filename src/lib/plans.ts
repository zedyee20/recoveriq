import type { Profile } from './types';

export const SUCCESS_FEE_RATE = 0.15;

export const PLANS: { id: Profile['plan']; name: string; price: string; points: string[] }[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    points: ['Up to 3 open claims', 'Claim detection & request letters', 'Deadline tracking'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$6.99 / month',
    points: ['Unlimited claims', 'Full escalation ladder & case summaries', 'Keep 100% of what you recover'],
  },
  {
    id: 'success',
    name: 'Pay on success',
    price: `${Math.round(SUCCESS_FEE_RATE * 100)}% of recovered money`,
    points: [
      'Unlimited claims, nothing up front',
      'Fee charged only after money reaches you',
      'Only offered where success fees are legally permitted',
    ],
  },
];

export function successFee(amount: number): number {
  return Math.round(amount * SUCCESS_FEE_RATE * 100) / 100;
}
