import { FormSelect } from "./FormSelect";

interface TimeValuePickerProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}

const normalizeTimeValue = (value: string) =>
  /^\d{2}:\d{2}$/.test(value) ? value : "00:00";

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export const TimeValuePicker = ({
  disabled = false,
  onChange,
  value
}: TimeValuePickerProps) => {
  const normalizedValue = normalizeTimeValue(value);
  const [hour, minute] = normalizedValue.split(":");

  return (
    <div className="site-time-range-picker settings-time-picker">
      <div className="site-time-picker-row settings-time-picker-row">
        <span className="site-time-picker-row-label">시각</span>
        <FormSelect
          className="site-time-part-shell"
          disabled={disabled}
          onChange={(event) => {
            onChange(`${event.target.value}:${minute}`);
          }}
          selectClassName="site-time-part-select"
          value={hour}
        >
          {hourOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </FormSelect>
        <span className="site-time-picker-divider">:</span>
        <FormSelect
          className="site-time-part-shell"
          disabled={disabled}
          onChange={(event) => {
            onChange(`${hour}:${event.target.value}`);
          }}
          selectClassName="site-time-part-select"
          value={minute}
        >
          {minuteOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </FormSelect>
      </div>
      <div className="site-time-range-preview settings-time-picker-preview">
        매일 {normalizedValue} 기준 자동 실행
      </div>
    </div>
  );
};
