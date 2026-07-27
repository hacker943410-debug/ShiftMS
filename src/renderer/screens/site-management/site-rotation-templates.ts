import type { TeamWorkType } from "@shared/domain/team-work-type";

// "자주 쓰는 패턴으로 시작" — 흔한 근무 회전을 고르면 조 수·교대·시간·패턴이 한 번에 채워진다.
// 각 템플릿은 '시작점'일 뿐이며, 적용 후 마법사에서 달력으로 확인하고 자유롭게 수정한다.
// patternString 은 압축 표기를 쓰지 않으므로 길이 = 하루 단위 칸 수와 같다.

// 한 근무 묶음. 여기에 배정될 조 수와 그 조들의 근무유형을 함께 정한다.
export interface RotationTemplateCycle {
  name: string;
  teamCount: number;
  teamWorkType: TeamWorkType;
  shiftCount: number;
  shiftTimes: string[];
  breakMinutes: number;
  patternString: string;
}

export interface RotationTemplate {
  key: string;
  label: string;
  description: string;
  cycles: RotationTemplateCycle[];
}

export const ROTATION_TEMPLATES: RotationTemplate[] = [
  {
    key: "day-only",
    label: "주간 전담",
    description: "낮 근무만 · 교대 없음",
    cycles: [
      {
        name: "근무 묶음 1",
        teamCount: 2,
        teamWorkType: "FIXED_DAY",
        shiftCount: 1,
        shiftTimes: ["09:00 - 18:00"],
        breakMinutes: 60,
        patternString: "주주주주주휴휴"
      }
    ]
  },
  {
    key: "two-team-two-shift",
    label: "격일제 / 2조 2교대",
    description: "주·야 번갈아 · 2개 조",
    cycles: [
      {
        name: "근무 묶음 1",
        teamCount: 2,
        teamWorkType: "ROTATING",
        shiftCount: 2,
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        breakMinutes: 60,
        patternString: "주주야야휴휴"
      }
    ]
  },
  {
    key: "three-team-two-shift",
    label: "3조 2교대",
    description: "주·야 + 휴식 · 3개 조",
    cycles: [
      {
        name: "근무 묶음 1",
        teamCount: 3,
        teamWorkType: "ROTATING",
        shiftCount: 2,
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        breakMinutes: 60,
        patternString: "주주야야휴휴"
      }
    ]
  },
  {
    key: "four-team-three-shift",
    label: "4조 3교대",
    description: "주·석·야 + 휴식 · 4개 조",
    cycles: [
      {
        name: "근무 묶음 1",
        teamCount: 4,
        teamWorkType: "ROTATING",
        shiftCount: 3,
        shiftTimes: ["06:00 - 14:00", "14:00 - 22:00", "22:00 - 06:00"],
        breakMinutes: 60,
        patternString: "주주석석야야휴휴"
      }
    ]
  },
  {
    key: "fixed-day-3on-3off",
    label: "주간고정 3주3휴",
    description: "3일 근무 · 3일 휴무 · 2개 조",
    cycles: [
      {
        name: "주간고정",
        teamCount: 2,
        teamWorkType: "FIXED_DAY",
        shiftCount: 1,
        shiftTimes: ["09:00 - 18:00"],
        breakMinutes: 60,
        patternString: "주주주휴휴휴"
      }
    ]
  },
  {
    key: "rotating-3on-3off-3night-3off",
    label: "주야간 3주3휴3야3휴",
    description: "주간 3일 · 휴무 3일 · 야간 3일 · 휴무 3일 · 4개 조",
    cycles: [
      {
        name: "주야교대",
        teamCount: 4,
        teamWorkType: "ROTATING",
        shiftCount: 2,
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        breakMinutes: 60,
        patternString: "주주주휴휴휴야야야휴휴휴"
      }
    ]
  },
  {
    key: "fixed-day-plus-rotating",
    label: "주간고정 2조 + 주야교대 4조",
    description: "A·B는 주간고정 3주3휴, C~F는 주야 3주3휴3야3휴",
    cycles: [
      {
        name: "주간고정",
        teamCount: 2,
        teamWorkType: "FIXED_DAY",
        shiftCount: 1,
        shiftTimes: ["09:00 - 18:00"],
        breakMinutes: 60,
        patternString: "주주주휴휴휴"
      },
      {
        name: "주야교대",
        teamCount: 4,
        teamWorkType: "ROTATING",
        shiftCount: 2,
        shiftTimes: ["07:00 - 19:00", "19:00 - 07:00"],
        breakMinutes: 60,
        patternString: "주주주휴휴휴야야야휴휴휴"
      }
    ]
  }
];

export const getRotationTemplateTeamCount = (template: RotationTemplate) =>
  template.cycles.reduce((total, cycle) => total + cycle.teamCount, 0);

// 조를 패턴 길이에 고르게 분산시킨 시작 위치(0 ~ 길이-1)를 만든다.
// 예: 4조 / 8일 → [0,2,4,6], 3조 / 6일 → [0,2,4], 2조 / 6일 → [0,3].
export const buildRotationTeamIndexes = (teamCount: number, cycleLength: number): number[] =>
  Array.from({ length: Math.max(teamCount, 0) }, (_, index) =>
    cycleLength > 0 ? Math.round((index * cycleLength) / Math.max(teamCount, 1)) % cycleLength : 0,
  );
