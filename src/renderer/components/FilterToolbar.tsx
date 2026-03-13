import { useDeferredValue, useState } from "react";

import { FormSelect } from "./FormSelect";

interface FilterToolbarProps {
  title: string;
  description: string;
  placeholder: string;
  options: string[];
  keyword?: string;
  selectedOption?: string;
  onKeywordChange?: (value: string) => void;
  onOptionChange?: (value: string) => void;
}

export const FilterToolbar = ({
  title,
  description,
  placeholder,
  options,
  keyword,
  selectedOption,
  onKeywordChange,
  onOptionChange
}: FilterToolbarProps) => {
  const [internalKeyword, setInternalKeyword] = useState("");
  const [internalOption, setInternalOption] = useState(options[0] ?? "");
  const resolvedKeyword = keyword ?? internalKeyword;
  const resolvedOption = selectedOption ?? internalOption;
  const deferredKeyword = useDeferredValue(resolvedKeyword);

  return (
    <section className="toolbar-card">
      <div>
        <p className="eyebrow">조회 조건</p>
        <h3>{title}</h3>
        <p className="toolbar-copy">{description}</p>
      </div>

      <div className="toolbar-controls">
        <label className="toolbar-field">
          <span>검색</span>
          <input
            onChange={(event) => {
              setInternalKeyword(event.target.value);
              onKeywordChange?.(event.target.value);
            }}
            placeholder={placeholder}
            value={resolvedKeyword}
          />
        </label>

        <label className="toolbar-field">
          <span>구분</span>
          <FormSelect
            className="top-filter-select-shell"
            onChange={(event) => {
              setInternalOption(event.target.value);
              onOptionChange?.(event.target.value);
            }}
            selectClassName="top-filter-select"
            value={resolvedOption}
          >
            {options.map((option) => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ))}
          </FormSelect>
        </label>
      </div>

      <p className="toolbar-summary">
        현재 필터: <strong>{resolvedOption}</strong>
        {deferredKeyword ? (
          <>
            {" "}
            / 검색어 <strong>{deferredKeyword}</strong>
          </>
        ) : null}
      </p>
    </section>
  );
};
