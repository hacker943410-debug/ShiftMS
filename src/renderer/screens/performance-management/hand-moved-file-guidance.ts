import type { GuidanceConfig } from "../../contexts/app-workflow-context";

// Guidance shown when a reapproval is blocked with "이미 승인 처리된 실적 행입니다" because the
// workbook was hand-moved out of 승인완료 back into 승인대기. The app then tracks the same file as two
// separate records (a phantom 승인완료 row whose file is gone + a fresh 승인대기 row), so every row
// reads as already-approved and the file can never return to 승인완료. The real fix is to put the
// file back where it belongs and refresh — never to keep hand-moving files.
export const buildHandMovedFileGuidance = (): GuidanceConfig => ({
  title: "이 파일은 지금 재승인이 되지 않습니다",
  why: "이 실적 파일이 '승인완료'에서 '승인대기'로 파일 탐색기를 통해 손으로 옮겨진 것으로 보입니다. 그러면 앱이 같은 파일을 서로 다른 두 개의 기록으로 인식해서, 모든 줄이 '이미 승인됨'으로 막히고 승인완료로 다시 넘어가지 못합니다.",
  steps: [
    {
      title: "옮긴 파일을 원래 자리로 되돌리기",
      description:
        "탐색기에서 이 실적 엑셀 파일을 찾아, 원래 있던 '승인완료' 폴더의 같은 연도·월 칸으로 그대로 되돌려 놓으세요. 폴더 위치와 파일 이름은 바꾸지 마세요."
    },
    {
      title: "앱에서 다시 조회하기",
      description:
        "'승인완료'를 해당 연도·월로 다시 조회하면 잘못 생긴 중복 줄이 정리되고 원래 승인 상태로 돌아옵니다."
    },
    {
      title: "휴일 근무가 빠져 있다면",
      description:
        "휴일 줄이 보이지 않으면, 운영 관리의 공휴일에 해당 공휴일을 먼저 등록한 뒤 근무표를 다시 발행해서, 그 파일로 다시 올려 승인하세요."
    }
  ],
  notes: [
    "※ 실적 파일을 탐색기로 직접 옮기지 마세요. 승인·반려·되돌리기 등 모든 이동은 반드시 앱 안에서만 하셔야 기록이 꼬이지 않습니다."
  ]
});
