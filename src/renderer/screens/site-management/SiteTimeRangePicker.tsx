import { FormSelect } from "../../components/FormSelect";

interface SiteTimeRangePickerProps {
  fallbackValue: string;
  onChange: (value: string) => void;
  value: string;
}

const timeHourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const timeMinuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const parseClockTime = (value: string) => {
  const matched = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!matched) {
    return null;
  }

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour: String(hour).padStart(2, "0"),
    minute: String(minute).padStart(2, "0")
  };
};

const buildTimeValue = (hour: string, minute: string) => `${hour}:${minute}`;

const buildTimeRangeValue = (
  startHour: string,
  startMinute: string,
  endHour: string,
  endMinute: string
) => `${buildTimeValue(startHour, startMinute)} - ${buildTimeValue(endHour, endMinute)}`;

const splitTimeRange = (value: string) => {
  const parts = value.split("-").map((item) => item.trim());

  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return null;
  }

  const startTime = parseClockTime(parts[0]);
  const endTime = parseClockTime(parts[1]);

  if (!startTime || !endTime) {
    return null;
  }

  return {
    startTime: buildTimeValue(startTime.hour, startTime.minute),
    endTime: buildTimeValue(endTime.hour, endTime.minute)
  };
};

const getTimeRangeParts = (value: string, fallbackValue: string) => {
  const parsed =
    splitTimeRange(value) ??
    splitTimeRange(fallbackValue) ??
    splitTimeRange("00:00 - 00:00") ?? {
      startTime: "00:00",
      endTime: "00:00"
    };
  const start = parseClockTime(parsed.startTime) ?? { hour: "00", minute: "00" };
  const end = parseClockTime(parsed.endTime) ?? { hour: "00", minute: "00" };

  return {
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute
  };
};

export const SiteTimeRangePicker = ({
  fallbackValue,
  onChange,
  value
}: SiteTimeRangePickerProps) => {
  const timeParts = getTimeRangeParts(value, fallbackValue);
  const previewValue = buildTimeRangeValue(
    timeParts.startHour,
    timeParts.startMinute,
    timeParts.endHour,
    timeParts.endMinute
  );

  const updateTimeRange = (
    nextPart:
      | { key: "startHour"; value: string }
      | { key: "startMinute"; value: string }
      | { key: "endHour"; value: string }
      | { key: "endMinute"; value: string }
  ) => {
    const nextTimeParts = {
      ...timeParts,
      [nextPart.key]: nextPart.value
    };

    onChange(
      buildTimeRangeValue(
        nextTimeParts.startHour,
        nextTimeParts.startMinute,
        nextTimeParts.endHour,
        nextTimeParts.endMinute
      )
    );
  };

  return (
    <div className="site-time-range-picker">
      <div className="site-time-picker-row">
        <span className="site-time-picker-row-label">시작</span>
        <FormSelect
          aria-label="시작 시"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "startHour", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.startHour}
        >
          {timeHourOptions.map((hour) => (
            <option key={`start-hour-${hour}`} value={hour}>
              {hour}
            </option>
          ))}
        </FormSelect>
        <span className="site-time-picker-divider">:</span>
        <FormSelect
          aria-label="시작 분"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "startMinute", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.startMinute}
        >
          {timeMinuteOptions.map((minute) => (
            <option key={`start-minute-${minute}`} value={minute}>
              {minute}
            </option>
          ))}
        </FormSelect>
      </div>
      <div className="site-time-picker-row">
        <span className="site-time-picker-row-label">종료</span>
        <FormSelect
          aria-label="종료 시"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "endHour", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.endHour}
        >
          {timeHourOptions.map((hour) => (
            <option key={`end-hour-${hour}`} value={hour}>
              {hour}
            </option>
          ))}
        </FormSelect>
        <span className="site-time-picker-divider">:</span>
        <FormSelect
          aria-label="종료 분"
          className="site-time-part-shell"
          onChange={(event) => {
            updateTimeRange({ key: "endMinute", value: event.target.value });
          }}
          selectClassName="site-time-part-select"
          value={timeParts.endMinute}
        >
          {timeMinuteOptions.map((minute) => (
            <option key={`end-minute-${minute}`} value={minute}>
              {minute}
            </option>
          ))}
        </FormSelect>
      </div>
      <span className="site-time-range-preview">{previewValue}</span>
    </div>
  );
};
