const pad = (value: number) => String(value).padStart(2, "0");

// 날짜 입력칸의 기본값은 운영자가 달력에서 보는 날짜와 같아야 한다. toISOString()은 UTC라
// 한국시간 자정~오전 9시 사이에는 하루 전 날짜가 나와 적용일이 하루 어긋난다.
export const formatLocalDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const createTodayDateInputValue = () => formatLocalDateInputValue(new Date());
