const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

const krwHourlyRateFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const formatCurrency = (value: number) => krwFormatter.format(value);

export const formatHourlyRateCurrency = (value: number) =>
  krwHourlyRateFormatter.format(value);
