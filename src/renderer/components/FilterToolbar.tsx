import { useDeferredValue, useState } from "react";

interface FilterToolbarProps {
  title: string;
  description: string;
  placeholder: string;
  options: string[];
}

export const FilterToolbar = ({
  title,
  description,
  placeholder,
  options
}: FilterToolbarProps) => {
  const [keyword, setKeyword] = useState("");
  const [selectedOption, setSelectedOption] = useState(options[0] ?? "");
  const deferredKeyword = useDeferredValue(keyword);

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
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={placeholder}
            value={keyword}
          />
        </label>

        <label className="toolbar-field">
          <span>구분</span>
          <select
            onChange={(event) => setSelectedOption(event.target.value)}
            value={selectedOption}
          >
            {options.map((option) => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="toolbar-summary">
        현재 필터: <strong>{selectedOption}</strong>
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
