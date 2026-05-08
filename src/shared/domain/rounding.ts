export const roundMoney = (amount: number) => Math.round(amount);

export const roundUpWon = (amount: number) => {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.ceil(amount);
};
