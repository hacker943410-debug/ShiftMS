import type { RouteKey } from "../mock-design-data";

import { AccessHistoryGuideScene } from "./AccessHistoryGuideScene";
import { AllowanceGuideScene } from "./AllowanceGuideScene";
import { DashboardGuideScene } from "./DashboardGuideScene";
import { OperationsGuideScene } from "./OperationsGuideScene";
import { PerformanceGuideScene } from "./PerformanceGuideScene";
import { ScheduleGuideScene } from "./ScheduleGuideScene";
import { SiteGuideScene } from "./SiteGuideScene";
import { WorkforceGuideScene } from "./WorkforceGuideScene";
import type { RouteGuideDefinition } from "./guide-types";

const dashboardGuide: RouteGuideDefinition = {
  routeKey: "dashboard",
  title: "대시보드 가이드",
  description: "월별 수당 집계와 예외 징후를 가장 먼저 확인하는 운영 시작 화면입니다.",
  pages: [
    {
      id: "dashboard-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "대시보드는 월간 운영 상태를 가장 먼저 읽는 화면입니다.",
      description:
        "실적 승인과 수당 계산이 누적되면 대시보드에서 총 근로시간, 수당 규모, 근무지 편차를 한 번에 확인할 수 있습니다.",
      goal: "운영자는 대시보드에서 이번 달 이상 징후를 먼저 찾고, 이후 실적 관리나 수당 관리 메뉴로 내려가는 흐름을 사용합니다.",
      steps: [
        {
          title: "조회 기준 고정",
          description: "연도, 월, 근무지, 이름 필터를 먼저 고정해 이번 화면에서 읽을 집계 기준을 맞춥니다."
        },
        {
          title: "핵심 KPI 확인",
          description: "총 근로시간과 주요 수당 카드에서 금액이나 시간의 급격한 변화가 있는지 먼저 봅니다."
        },
        {
          title: "차트로 원인 압축",
          description: "좌상단 월별 추이, 우상단 근무지 현황, 좌하단 근무 유형별 Top 10, 우하단 유형 비율 순서로 이상치가 어디에서 시작됐는지 좁힙니다."
        },
        {
          title: "현재 화면 기준 내보내기",
          description: "필터와 화면 결과가 맞으면 PDF나 Excel로 저장해 보고와 공유에 바로 사용합니다."
        }
      ],
      detailItems: [
        {
          title: "조회 기준 영역",
          description: "상단 필터는 카드, 차트, 내보내기 결과에 동일하게 적용됩니다. 먼저 범위를 고정해야 이후 해석이 흔들리지 않습니다."
        },
        {
          title: "핵심 KPI 카드",
          description: "총 근로시간, 총 지급수당, 주요 수당 합계를 가장 먼저 읽어 이번 달 규모를 빠르게 파악합니다."
        },
        {
          title: "차트 분석 영역",
          description: "좌상단 월별 추이, 우상단 근무지별 현황, 좌하단 근무 유형별 Top 10, 우하단 유형 비율을 함께 읽어 시점, 근무지, 인원, 유형 관점의 편차를 해석합니다."
        },
        {
          title: "내보내기 액션",
          description: "전체 내보내기는 상단 헤더에서, 카드별 개별 내보내기는 각 카드 우측 상단에서 실행합니다. 보고용 PDF와 가공용 Excel을 구분해 사용합니다."
        }
      ],
      notes: [
        "대시보드 수치는 승인된 수당 데이터를 기준으로 집계됩니다.",
        "필터를 바꾸면 카드, 차트, 내보내기 결과가 같은 조건으로 함께 갱신됩니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <DashboardGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="overview" />
      )
    },
    {
      id: "dashboard-toc",
      kind: "toc",
      navLabel: "목차",
      title: "대시보드에서는 네 가지 흐름을 순서대로 보면 됩니다.",
      description: "조회 필터를 정한 뒤 KPI, 차트, 내보내기 순서로 보면 운영 판단이 가장 빠릅니다.",
      goal: "목차 페이지는 이 메뉴에서 어떤 블록을 어떤 순서로 읽어야 하는지 기준을 잡아 줍니다.",
      steps: [
        {
          title: "조회 필터",
          description: "연도, 월, 근무지, 이름을 조합해 필요한 집계 범위를 좁힙니다."
        },
        {
          title: "핵심 KPI",
          description: "총 근로시간과 주요 수당 합계를 먼저 보고 전월 대비 변화를 해석합니다."
        },
        {
          title: "차트 분석",
          description: "월별 추이, 근무지별 현황, 근무 유형별 Top 10, 유형 비율을 비교해 편차 원인을 찾습니다."
        },
        {
          title: "문서 내보내기",
          description: "현재 화면 조건 그대로 PDF 또는 Excel로 저장해 보고나 공유에 사용합니다."
        }
      ],
      detailItems: [
        {
          title: "조회 필터 블록",
          description: "연도, 월, 근무지, 이름 필터는 이후 KPI와 차트, 내보내기 결과의 공통 기준이 됩니다."
        },
        {
          title: "핵심 KPI 블록",
          description: "이번 달 규모와 급격한 변화 여부를 가장 먼저 읽는 요약 영역입니다."
        },
        {
          title: "차트 분석 블록",
          description: "추이, 근무지, 인원, 유형 비율을 서로 대조해 원인 후보를 압축하는 구간입니다."
        },
        {
          title: "문서 내보내기 블록",
          description: "현재 필터 상태 그대로 보고용 PDF와 가공용 Excel을 남기는 마감 액션입니다."
        }
      ],
      notes: ["처음 보는 운영자라면 목차 페이지를 읽은 뒤 상세 기능 페이지를 순서대로 확인하면 됩니다."],
      figure: <DashboardGuideScene variant="toc" />
    },
    {
      id: "dashboard-filters",
      kind: "feature",
      navLabel: "조회 필터",
      title: "조회 필터는 왼쪽에서 오른쪽 순서로 좁혀야 해석 오류가 줄어듭니다.",
      description:
        "대시보드 상단 필터는 연도, 월, 근무지, 이름 순서로 연결돼 있습니다. 범위를 먼저 고정하면 이후 카드와 차트를 같은 기준으로 볼 수 있습니다.",
      goal: "조회 필터를 먼저 맞추면 차트와 내보내기 문서까지 같은 기준으로 정리됩니다.",
      steps: [
        {
          title: "조회 연도 선택",
          description: "현재 정산 대상 연도를 선택해 연간 범위를 먼저 정합니다."
        },
        {
          title: "조회 월 선택",
          description: "월을 특정하면 이번 달 현황을, 전체를 두면 연간 누적 흐름을 확인할 수 있습니다."
        },
        {
          title: "근무지와 이름 보정",
          description: "근무지 편차를 볼 때는 근무지 먼저, 특정 인원을 확인할 때는 이름까지 추가로 좁힙니다."
        }
      ],
      detailItems: [
        {
          title: "연도 필터",
          description: "연간 집계 범위를 먼저 정한 뒤 월을 선택하면 월간/연간 비교 기준이 흔들리지 않습니다."
        },
        {
          title: "월 필터",
          description: "월을 고정하면 이번 달 기준 집계를 빠르게 볼 수 있고, 연간 누적 흐름은 전체 월 조회에서 확인합니다."
        },
        {
          title: "근무지 필터",
          description: "근무지별 편차를 볼 때는 근무지를 먼저 좁혀 원인 대상을 분명하게 합니다."
        },
        {
          title: "이름 필터",
          description: "특정 인원 확인은 마지막 단계에서 적용해 전체 집계 해석과 개인 확인 흐름을 분리합니다."
        }
      ],
      notes: [
        "이름 필터는 연도, 월, 근무지 조건이 정리된 뒤 마지막에 사용하는 것이 좋습니다.",
        "필터를 바꾸면 내보내기 결과도 즉시 같은 조건으로 저장됩니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <DashboardGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="filters" />
      )
    },
    {
      id: "dashboard-insights",
      kind: "feature",
      navLabel: "지표 읽기",
      title: "KPI와 차트는 위에서 아래로, 전체에서 상세로 읽습니다.",
      description:
        "대시보드 본문은 KPI 카드 뒤에 좌상단 월별 추이, 우상단 근무지 비교, 좌하단 근무 유형별 Top 10, 우하단 유형 비율 순서로 읽으면 원인을 좁히기 쉽도록 구성돼 있습니다.",
      goal: "수당 급증 원인을 찾을 때는 카드에서 징후를 보고 차트에서 시점과 범위를 좁히는 흐름이 가장 실무적입니다.",
      steps: [
        {
          title: "KPI 카드에서 이상치 확인",
          description: "총 근로시간, 총 지급수당, 주요 수당 항목 중 어느 값이 튀는지 먼저 확인합니다."
        },
        {
          title: "월별 추이로 시작 시점 확인",
          description: "언제부터 값이 증가했는지 차트에서 확인하면 승인 이력과 대조하기 쉬워집니다."
        },
        {
          title: "Top 10과 유형 비율로 원인 압축",
          description: "좌하단 근무 유형별 상위 인원 카드에서 법정휴일·대체근무·연장근무 탭을 바꿔 보고, 우하단 비율 카드와 함께 특정 인원 집중인지 유형 확대인지 이어서 확인합니다."
        }
      ],
      detailItems: [
        {
          title: "핵심 KPI 카드",
          description: "카드 영역은 전체 규모와 급격한 변화 여부를 가장 빠르게 알려 주는 1차 해석 구간입니다."
        },
        {
          title: "월별 추이 차트",
          description: "언제부터 값이 올라갔는지 확인한 뒤 승인 이력이나 수당 승인 흐름과 시점을 맞춰 볼 수 있습니다."
        },
        {
          title: "하단 분석 카드",
          description: "좌하단 근무 유형별 Top 10에서 탭별 인원 집중 여부를 보고, 우하단 유형 비율로 연장·대체·휴일 중 어떤 유형 비중이 커졌는지 함께 확인합니다."
        }
      ],
      notes: [
        "대시보드는 상세 편집 화면이 아니라 원인 후보를 찾는 요약 화면입니다.",
        "이상치가 보이면 실적 관리, 수당 관리, 활동 이력 메뉴를 함께 확인하는 흐름이 좋습니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <DashboardGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="insights" />
      )
    },
    {
      id: "dashboard-export",
      kind: "feature",
      navLabel: "내보내기",
      title: "내보내기는 현재 필터 상태를 그대로 문서화하는 마지막 단계입니다.",
      description:
        "대시보드 상단 헤더의 전체 내보내기와 각 카드 우측 상단 개별 내보내기 버튼은 현재 보이는 집계 상태를 그대로 PDF 또는 Excel로 저장합니다.",
      goal: "보고용 자료를 만들기 전 마지막으로 필터와 화면 내용을 확인한 뒤 저장하는 흐름을 고정합니다.",
      steps: [
        {
          title: "필터와 화면 결과 확인",
          description: "저장 전 연도, 월, 근무지, 이름 조건이 보고 대상과 일치하는지 다시 확인합니다."
        },
        {
          title: "PDF 또는 Excel 선택",
          description: "보고서 공유는 PDF, 추가 가공이나 합산은 Excel을 사용하면 실무 흐름이 자연스럽습니다."
        },
        {
          title: "저장 완료 메시지 확인",
          description: "파일명이 표시되면 현재 화면 조건으로 저장이 끝난 상태이며, 이후 공유나 보관을 진행합니다."
        }
      ],
      detailItems: [
        {
          title: "필터 조건 재확인",
          description: "내보내기 전에는 현재 보이는 필터와 카드/차트 결과가 보고 대상과 맞는지 다시 확인해야 합니다."
        },
        {
          title: "내보내기 버튼 선택",
          description: "보고서 공유는 PDF, 추가 가공은 Excel로 나눠 사용합니다. 전체 내보내기는 헤더에서, 카드별 저장은 각 카드 우측 상단에서 선택합니다."
        },
        {
          title: "저장 완료 확인",
          description: "완료 메시지와 파일명을 확인하면 보관, 공유, 추후 대조에 사용할 기준 문서가 만들어진 상태입니다."
        }
      ],
      notes: [
        "필터를 바꾼 직후 저장하면 그 시점의 화면 기준으로 내보내집니다.",
        "추후 다른 메뉴도 같은 방식으로 메뉴 가이드와 세부 기능 가이드가 연결됩니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <DashboardGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="export" />
      )
    }
  ]
};

const workforceGuide: RouteGuideDefinition = {
  routeKey: "workforce",
  title: "인력 관리 가이드",
  description: "사원 명부, 프로필 상세, 시급 변경 이력을 함께 관리하는 기준 메뉴입니다.",
  pages: [
    {
      id: "workforce-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "인력 관리는 사원 명부를 조회하고 신규 등록, 프로필 검토, 시급 변경을 처리하는 화면입니다.",
      description:
        "근무지와 상태 기준으로 목록을 좁히고, 프로필 상세에서 근무변경이력과 시급변경이력을 같이 확인합니다.",
      goal: "운영자는 목록 범위를 먼저 정하고, 신규 등록 또는 프로필 검토, 시급 일괄 업데이트 흐름으로 이어집니다.",
      steps: [
        {
          title: "목록 범위 확인",
          description: "근무지, 현재상태, 배정상태, 검색어를 먼저 정해 현재 확인할 인력만 남깁니다."
        },
        {
          title: "프로필 상세 및 이력 검토",
          description: "행 우측 프로필 보기로 상세에 들어가 현재 값과 변경 이력을 같이 대조합니다."
        },
        {
          title: "등록 또는 시급 변경",
          description: "단건은 신규 인력 등록, 대량 변경은 시급 일괄 업데이트로 처리합니다."
        }
      ],
      detailItems: [
        {
          title: "상단 필터 범위",
          description: "근무지, 상태, 검색 조건으로 현재 확인할 인력 집합을 먼저 고정하는 구간입니다."
        },
        {
          title: "프로필 진입 행",
          description: "목록 첫 행처럼 현재 사원 상태와 프로필 보기 진입점을 한 줄에서 보여 줍니다."
        },
        {
          title: "대량 시급 변경 진입",
          description: "시급 일괄 업데이트 버튼은 Excel 기반 대량 변경 흐름으로 이어지는 별도 시작점입니다."
        }
      ],
      notes: [
        "통상시급과 배정상태는 이후 실적 승인과 수당 흐름에 직접 영향을 줍니다.",
        "시급 변경은 기존 이력을 덮어쓰지 않고 새 이력을 추가하는 방식으로 관리합니다."
      ],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="overview" />
    },
    {
      id: "workforce-toc",
      kind: "toc",
      navLabel: "목차",
      title: "인력 관리는 목록 조회, 신규 등록, 프로필 이력, 시급 일괄 업데이트 순서로 보면 됩니다.",
      description: "목록에서 대상을 좁힌 뒤 단건 처리와 대량 처리 흐름으로 나누어 보는 것이 가장 실무적입니다.",
      goal: "목차 페이지는 인력 관리 메뉴에서 어떤 블록을 어떤 순서로 다뤄야 하는지 기준을 잡아 줍니다.",
      steps: [
        { title: "목록 조회", description: "근무지와 상태를 기준으로 현재 확인할 사원 목록을 정합니다." },
        { title: "신규 등록", description: "사원 기본 정보와 최초 시급, 배정 기준을 함께 저장합니다." },
        { title: "프로필 및 이력", description: "현재 값과 근무/시급 변경 이력을 함께 확인합니다." },
        { title: "시급 일괄 업데이트", description: "Excel 파일 검증 뒤 다수 인력의 시급 이력을 한 번에 반영합니다." }
      ],
      detailItems: [
        {
          title: "목록 조회 흐름",
          description: "현재 운영 인력을 어떤 조건으로 보고 있는지 결정하는 시작 블록입니다."
        },
        {
          title: "신규 등록 흐름",
          description: "단건 인력 추가와 최초 시급 기준 생성이 이어지는 등록 단계입니다."
        },
        {
          title: "프로필·이력 흐름",
          description: "현재 값과 변경 근거를 같이 읽어 수정 여부를 판단하는 검토 단계입니다."
        },
        {
          title: "시급 일괄 업데이트 흐름",
          description: "Excel 검증 후 다수 인력의 시급 이력을 한 번에 생성하는 대량 처리 단계입니다."
        }
      ],
      notes: ["단건 수정과 대량 변경을 혼동하지 않도록 메뉴 흐름을 분리해 보는 것이 좋습니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="toc" />
    },
    {
      id: "workforce-filters",
      kind: "feature",
      navLabel: "목록 조회",
      title: "인력 목록은 근무지와 상태를 먼저 좁힌 뒤 검색을 마지막에 더해야 오류가 줄어듭니다.",
      description:
        "인력 관리 상단 필터는 근무지, 현재상태, 배정상태, 검색으로 구성돼 있어 목록 범위를 빠르게 고정할 수 있습니다.",
      goal: "목록 범위가 먼저 정리되어야 신규 등록 후 확인, 프로필 검토, 시급 변경 대상 확인이 모두 쉬워집니다.",
      steps: [
        {
          title: "근무지 선택",
          description: "현재 운영 중인 특정 근무지 인력만 보려면 근무지 필터를 먼저 선택합니다."
        },
        {
          title: "현재상태와 배정상태 조합",
          description: "재직/휴직/퇴사와 배정중/미배정을 조합해 필요한 인력만 남깁니다."
        },
        {
          title: "이름 또는 사원번호 검색",
          description: "마지막에 이름/사원번호 검색을 더해 단건 확인 대상으로 좁힙니다."
        }
      ],
      detailItems: [
        {
          title: "근무지 필터",
          description: "특정 사업장 인력만 남겨 명부 범위를 빠르게 줄이는 첫 기준입니다."
        },
        {
          title: "현재상태·배정상태 필터",
          description: "재직 여부와 실제 배정 여부를 조합해 검토 대상을 정확히 남깁니다."
        },
        {
          title: "검색 필드",
          description: "마지막 단계에서 이름이나 사원번호로 단건 확인 대상으로 좁히는 보조 필터입니다."
        }
      ],
      notes: ["검색어를 먼저 넣기보다 상태 필터를 먼저 정리하는 편이 명부 해석이 더 안정적입니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="filters" />
    },
    {
      id: "workforce-create",
      kind: "feature",
      navLabel: "신규 등록",
      title: "신규 인력 등록은 기본 정보와 최초 시급, 적용일을 같이 저장해야 이후 이력이 자연스럽게 이어집니다.",
      description:
        "신규 인력 등록 모달은 인적사항뿐 아니라 현재 근무지와 시급 기준을 함께 기록하는 시작점입니다.",
      goal: "신규 등록 직후 목록과 프로필 상세에서 동일한 값이 보여야 이후 배정과 시급 이력이 자연스럽게 이어집니다.",
      steps: [
        { title: "사원 기본 정보 입력", description: "고용형태와 이름, 근무지 기준을 먼저 입력합니다." },
        { title: "최초 시급과 적용일 확정", description: "현재 통상시급과 적용 시작일을 같이 저장합니다." },
        { title: "저장 후 목록 재확인", description: "저장 후 명부와 프로필 화면에서 바로 값이 반영됐는지 확인합니다." }
      ],
      detailItems: [
        {
          title: "기본 정보 입력 영역",
          description: "사원 기본 정보와 근무지 기준을 함께 기록해 신규 인력의 기준점을 만듭니다."
        },
        {
          title: "시급·적용일 영역",
          description: "최초 통상시급과 적용 시작일을 같이 남겨 이후 시급 이력의 시작점을 만듭니다."
        },
        {
          title: "저장 액션",
          description: "저장 버튼을 눌러야 목록과 프로필 상세에서 신규 기준이 같은 값으로 보입니다."
        }
      ],
      notes: ["최초 시급 입력이 빠지면 이후 시급 이력 기준점이 흐려집니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="create" />
    },
    {
      id: "workforce-detail",
      kind: "feature",
      navLabel: "프로필·이력",
      title: "프로필 상세에서는 현재 값과 근무/시급 변경 이력을 같이 읽어야 수정 근거를 놓치지 않습니다.",
      description:
        "프로필 화면은 현재 배정 상태, 현재 시급, 근무기간과 함께 오른쪽 이력 타임라인을 같이 보여줍니다.",
      goal: "상세 검토 시 현재 값이 언제 어떤 이유로 바뀌었는지 바로 추적할 수 있어야 합니다.",
      steps: [
        { title: "현재 값 확인", description: "현재 근무지, 조, 시급, 상태를 먼저 봅니다." },
        { title: "근무변경이력 검토", description: "언제 어느 근무지/조로 이동했는지 이력에서 확인합니다." },
        { title: "시급변경이력 검토", description: "시급이 어떤 적용일 기준으로 바뀌었는지 마지막으로 확인합니다." }
      ],
      detailItems: [
        {
          title: "현재 프로필 정보",
          description: "현재 근무지, 조, 시급, 상태를 보여 주는 기준 카드입니다."
        },
        {
          title: "근무변경이력",
          description: "배정 이동이나 근무지 변경 이력을 시간 순서로 추적하는 타임라인입니다."
        },
        {
          title: "시급변경이력",
          description: "적용일 기준으로 시급이 어떻게 바뀌었는지 검토하는 근거 블록입니다."
        }
      ],
      notes: ["현재 값만 보고 저장하지 말고 변경 이력과 같이 대조하는 습관이 중요합니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="detail" />
    },
    {
      id: "workforce-wage-bulk",
      kind: "feature",
      navLabel: "시급 일괄 업데이트",
      title: "시급 일괄 업데이트는 Excel 파일 검증을 먼저 끝낸 뒤 미리보기 결과를 보고 반영해야 합니다.",
      description:
        "상단 버튼으로 여는 시급 일괄 업데이트 모달은 파일 선택, 열 매핑, 미리보기, 반영 순서로 구성됩니다.",
      goal: "잘못된 파일이나 열 매핑으로 인한 대량 오반영을 막고, 적용 대상과 제외 대상을 먼저 확인하는 흐름을 고정합니다.",
      steps: [
        { title: "파일 선택", description: "표준 Excel 파일을 가져오고 첫 번째 시트를 기준으로 읽습니다." },
        { title: "열 매핑 및 미리보기", description: "근무지명, 이름, 시급 열 문자를 지정한 뒤 미리보기로 검증합니다." },
        { title: "일괄 반영", description: "적용 가능 목록과 제외 목록을 확인한 뒤 시급 이력을 생성합니다." }
      ],
      detailItems: [
        {
          title: "진입 버튼",
          description: "시급 일괄 업데이트 버튼으로 Excel 기반 대량 변경 모달을 엽니다."
        },
        {
          title: "파일·열 매핑 구간",
          description: "원본 파일과 근무지명, 이름, 시급 열 지정이 정확해야 대상자를 올바르게 찾을 수 있습니다."
        },
        {
          title: "미리보기·반영 구간",
          description: "적용 가능과 제외 대상을 먼저 검토하고 마지막에 새 시급 이력을 생성합니다."
        }
      ],
      notes: ["이 기능의 상세 흐름은 모달 안 `가이드 보기`로 더 자세히 확인할 수 있습니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="wage-bulk" />
    }
  ]
};

export const workforceWageBulkGuide: RouteGuideDefinition = {
  routeKey: "workforce",
  title: "시급 일괄 업데이트 가이드",
  description: "Excel 파일 구조와 미리보기 기준을 먼저 확인하고 다수 인력의 시급 이력을 반영하는 세부 가이드입니다.",
  pages: [
    {
      id: "workforce-wage-bulk-intro",
      kind: "intro",
      navLabel: "가이드 소개",
      title: "시급 일괄 업데이트는 Excel 파일을 검증한 뒤 시급 이력을 한 번에 반영하는 모달입니다.",
      description: "이 기능은 근무지명, 이름, 시급 열을 기준으로 대상을 찾고 적용일 기준 새 시급 이력을 생성합니다.",
      goal: "대량 변경 전에 파일 구조와 열 매핑을 먼저 검증하는 작업 습관을 고정합니다.",
      steps: [
        { title: "표준 Excel 준비", description: "1행 헤더, 2행부터 데이터 구조로 파일을 맞춥니다." },
        { title: "열 매핑 검증", description: "근무지명, 이름, 시급 열 문자를 정확히 입력합니다." },
        { title: "미리보기 후 반영", description: "적용 가능과 제외 대상을 먼저 확인한 뒤 반영합니다." }
      ],
      detailItems: [
        {
          title: "원본 파일 기준",
          description: "표준 Excel 구조를 지켜야 자동 매칭과 미리보기 정확도가 보장됩니다."
        },
        {
          title: "열 매핑 기준",
          description: "근무지명, 이름, 시급 열 문자는 실제 매칭 로직의 핵심 입력값입니다."
        },
        {
          title: "최종 반영 기준",
          description: "미리보기 검증을 마친 뒤에만 실제 시급 이력을 생성하는 흐름입니다."
        }
      ],
      notes: ["직접 입력 경로보다 `파일 가져오기` 버튼으로 선택하는 방식만 사용합니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="wage-bulk" />
    },
    {
      id: "workforce-wage-bulk-toc",
      kind: "toc",
      navLabel: "목차",
      title: "시급 일괄 업데이트는 파일 준비, 열 매핑, 미리보기, 반영 순서로 보면 됩니다.",
      description: "목차 페이지는 이 모달에서 어떤 순서로 확인해야 안전한지 기준을 잡아 줍니다.",
      goal: "대량 변경 기능일수록 준비와 검증 단계를 명확히 구분하는 것이 중요합니다.",
      steps: [
        { title: "파일 준비", description: "표준 Excel 구조를 먼저 맞춥니다." },
        { title: "열 매핑", description: "근무지명, 이름, 시급 열을 지정합니다." },
        { title: "미리보기 검증", description: "적용 가능과 제외 대상을 먼저 검토합니다." },
        { title: "일괄 반영", description: "검증 후 시급 이력을 한 번에 생성합니다." }
      ],
      detailItems: [
        {
          title: "파일 준비 단계",
          description: "헤더와 데이터 구조가 맞는지 먼저 확인하는 시작 단계입니다."
        },
        {
          title: "열 매핑 단계",
          description: "근무지명, 이름, 시급 열을 지정해 실제 매칭 기준을 만듭니다."
        },
        {
          title: "미리보기 단계",
          description: "적용 가능과 제외 대상을 먼저 읽어 오반영을 막는 검증 단계입니다."
        },
        {
          title: "반영 단계",
          description: "검토가 끝난 뒤 새 시급 이력을 DB에 기록하는 최종 실행 단계입니다."
        }
      ],
      notes: ["목차를 본 뒤 다음 페이지를 순서대로 보면 실제 작업 순서와 같습니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="wage-bulk-toc" />
    },
    {
      id: "workforce-wage-bulk-sheet",
      kind: "feature",
      navLabel: "파일·열 매핑",
      title: "파일 가져오기와 열 매핑은 미리보기 결과 정확도를 결정하는 핵심 단계입니다.",
      description: "파일을 불러온 뒤 근무지명, 이름, 시급 열을 정확히 지정해야 대상자가 올바르게 매칭됩니다.",
      goal: "열 문자를 잘못 넣어도 미리보기에서 즉시 발견할 수 있도록 준비 단계를 명확히 합니다.",
      steps: [
        { title: "파일 선택", description: "첫 번째 시트를 기준으로 읽을 Excel 파일을 선택합니다." },
        { title: "근무지명/이름/시급 열 지정", description: "예: B, C, D처럼 열 문자를 각각 입력합니다." },
        { title: "적용일 확정", description: "새 시급이력의 시작일이 될 적용 날짜를 입력합니다." }
      ],
      detailItems: [
        {
          title: "파일 가져오기 버튼",
          description: "원본 Excel 파일을 선택해 모달 분석 입력값을 채우는 시작 버튼입니다."
        },
        {
          title: "열 매핑 입력 카드",
          description: "근무지명, 이름, 시급 열 문자를 지정해 행 매칭 기준을 정합니다."
        },
        {
          title: "적용일 카드",
          description: "새 시급 이력의 시작일이 될 날짜를 정하는 마지막 준비 항목입니다."
        }
      ],
      notes: ["1행은 헤더, 2행부터 실제 데이터라는 기준을 지키는 것이 가장 중요합니다."],
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="wage-bulk-sheet" />
    },
    {
      id: "workforce-wage-bulk-preview",
      kind: "feature",
      navLabel: "미리보기·반영",
      title: "적용 가능 목록과 제외 목록을 먼저 읽은 뒤 마지막에 시급 일괄 업데이트를 실행합니다.",
      description:
        "미리보기 화면은 적용 전/후 시급과 제외 사유를 나눠 보여주므로, 반영 전에 검증 근거를 남기기 좋습니다.",
      goal: "대상자와 제외 사유를 먼저 확인하고 마지막에 한 번만 반영하는 절차를 고정합니다.",
      steps: [
        { title: "적용 가능 목록 확인", description: "누구의 시급이 얼마에서 얼마로 바뀌는지 먼저 확인합니다." },
        { title: "제외 사유 확인", description: "근무지/이름 불일치, 형식 오류, 중복 행 등을 검토합니다." },
        { title: "시급 일괄 업데이트 실행", description: "검증이 끝나면 반영 버튼으로 새 시급 이력을 생성합니다." }
      ],
      detailItems: [
        {
          title: "적용 가능 목록",
          description: "적용 전·후 시급을 비교하며 실제 반영 대상자를 검증하는 핵심 표입니다."
        },
        {
          title: "제외 목록",
          description: "자동 반영되지 않는 행과 사유를 읽어 원본 데이터 품질을 판단합니다."
        },
        {
          title: "최종 반영 버튼",
          description: "검토가 끝난 뒤 새 시급 이력을 실제로 생성하는 마지막 실행 버튼입니다."
        }
      ],
      notes: ["제외 목록이 많으면 원본 Excel 구조를 먼저 다시 점검하는 편이 안전합니다."],
      outcome: "적용 가능 대상의 새 시급 이력이 생성되고, 제외 대상은 변경되지 않습니다.",
      renderFigure: ({ activeFocusIndex }) => <WorkforceGuideScene activeFocusIndex={activeFocusIndex} variant="wage-bulk-preview" />
    }
  ]
};

const siteGuide: RouteGuideDefinition = {
  routeKey: "sites",
  title: "근무지 관리 가이드",
  description: "근무지 목록, 패턴 등록, 조직 구성, 상세 검토를 함께 다루는 기준 메뉴입니다.",
  pages: [
    {
      id: "sites-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "근무지 관리는 저장된 근무지 목록을 보고 신규 등록, 상세 검토, 패턴 산출 흐름으로 이어지는 화면입니다.",
      description:
        "근무지의 Cycle과 운영 구조를 먼저 확인하고, 신규 등록은 1단계 패턴 등록과 2단계 조직 구성으로 나누어 처리합니다.",
      goal: "운영자는 목록에서 현재 기준을 확인한 뒤 신규 등록 또는 수정, 패턴 산출 흐름으로 자연스럽게 이어집니다.",
      steps: [
        { title: "목록과 상태 확인", description: "저장된 근무지와 운영중 여부, Cycle 구조를 먼저 확인합니다." },
        { title: "등록/수정 흐름 진입", description: "근무지 등록 또는 상세 보기를 통해 1단계/2단계 흐름으로 들어갑니다." },
        { title: "패턴 산출 활용", description: "표준 근무표가 있으면 패턴 적용된 근무지 추가로 draft를 자동 채웁니다." }
      ],
      detailItems: [
        {
          title: "근무지 목록 영역",
          description: "현재 등록된 근무지와 운영중 상태, Cycle 구조를 읽는 출발점입니다."
        },
        {
          title: "등록·상세 진입 액션",
          description: "근무지 등록과 상세 보기로 1단계/2단계 또는 수정 흐름으로 이동합니다."
        },
        {
          title: "패턴 산출 진입",
          description: "표준 근무표가 있을 때 draft를 자동 채우는 별도 시작 버튼입니다."
        }
      ],
      notes: [
        "근무지 패턴은 근무표 배포와 인력 배정 흐름의 기준 데이터입니다.",
        "Cycle과 조별 Index를 잘못 저장하면 달력 시뮬레이션과 배포 결과가 함께 흔들립니다."
      ],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="overview" />
    },
    {
      id: "sites-toc",
      kind: "toc",
      navLabel: "목차",
      title: "근무지 관리는 목록 확인, 1단계 패턴 등록, 2단계 조직 구성, 상세 보기, 패턴 산출 순서로 보면 됩니다.",
      description: "신규 등록은 1단계와 2단계를 나누어 보고, 이미 저장된 근무지는 상세 보기에서 다시 검토합니다.",
      goal: "목차 페이지는 근무지 관리 메뉴에서 어떤 흐름을 어떤 순서로 다뤄야 하는지 기준을 잡아 줍니다.",
      steps: [
        { title: "목록 확인", description: "현재 저장된 근무지와 상태를 먼저 봅니다." },
        { title: "1단계 패턴 등록", description: "기본 정보와 Cycle 구성을 저장합니다." },
        { title: "2단계 조직 구성", description: "후보 인력을 조별로 배정합니다." },
        { title: "상세 보기/패턴 산출", description: "저장된 구성 검토와 Excel 기반 산출 흐름으로 이어집니다." }
      ],
      detailItems: [
        {
          title: "목록 확인 흐름",
          description: "현재 저장된 근무지 현황을 읽고 어느 대상을 다룰지 결정하는 시작 블록입니다."
        },
        {
          title: "1단계 패턴 등록 흐름",
          description: "기본 정보와 Cycle 기준을 저장해 근무지의 패턴 초안을 만드는 단계입니다."
        },
        {
          title: "2단계 조직 구성 흐름",
          description: "후보 인력을 실제 조별 배정으로 연결해 근무지 구성을 완성하는 단계입니다."
        },
        {
          title: "상세 보기·패턴 산출 흐름",
          description: "저장된 구성 검토와 Excel 기반 draft 생성으로 이어지는 후속 흐름입니다."
        }
      ],
      notes: ["신규 등록과 패턴 산출은 서로 다른 시작점이지만, 최종적으로 1단계 draft에서 만납니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="toc" />
    },
    {
      id: "sites-list",
      kind: "feature",
      navLabel: "목록 확인",
      title: "근무지 목록에서는 Cycle, 운영 구조, 조 현황을 함께 읽어 어떤 근무지를 다뤄야 할지 먼저 정합니다.",
      description:
        "목록 테이블은 근무지 기본 정보뿐 아니라 Cycle 패턴, 조 현황, Pool 운영 여부를 같은 줄에서 보여줍니다.",
      goal: "상세 보기나 신규 등록으로 내려가기 전에 현재 기준 데이터를 목록에서 먼저 확인하는 습관을 고정합니다.",
      steps: [
        { title: "근무지명과 상태 확인", description: "운영중 여부와 대상 근무지를 먼저 확인합니다." },
        { title: "Cycle/운영 구조 확인", description: "Cycle 수와 교대 구조가 기대와 맞는지 검토합니다." },
        { title: "상세 보기로 이동", description: "수정이나 재검토가 필요한 근무지는 상세 보기로 들어갑니다." }
      ],
      detailItems: [
        {
          title: "근무지명·상태 열",
          description: "현재 운영중인지와 대상 근무지가 맞는지 먼저 확인하는 기준 열입니다."
        },
        {
          title: "Cycle·운영 구조 열",
          description: "Cycle 수와 교대 구조, 조 현황을 같은 줄에서 읽어 구성 이상 여부를 판단합니다."
        },
        {
          title: "상세 보기 액션",
          description: "수정이나 재검토가 필요한 근무지의 상세 화면으로 이동하는 실행 버튼입니다."
        }
      ],
      notes: ["조 현황이 비어 있거나 Cycle 요약이 비정상이면 상세 보기에서 바로 검토하는 것이 좋습니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="list" />
    },
    {
      id: "sites-step1",
      kind: "feature",
      navLabel: "1단계 패턴 등록",
      title: "1단계 패턴 등록은 기본 정보와 Cycle 구성을 저장하고 달력 시뮬레이션으로 바로 검토하는 단계입니다.",
      description:
        "좌측 입력 블록과 우측 월간 달력 시뮬레이션을 번갈아 보며 패턴 시작일과 배정을 검토합니다.",
      goal: "Cycle과 달력 배치가 먼저 맞아야 2단계 조직 구성에서 조별 배정이 흔들리지 않습니다.",
      steps: [
        { title: "기본 정보 입력", description: "근무지명, 상태, 조 수, Cycle 수를 먼저 맞춥니다." },
        { title: "Cycle 구성 및 Pool 설정", description: "Cycle별 패턴과 Pool 기준을 저장합니다." },
        { title: "달력 시뮬레이션 검토", description: "우측 달력에서 월간 순환 배치가 기대와 맞는지 확인합니다." }
      ],
      detailItems: [
        {
          title: "기본 정보 카드",
          description: "근무지명, 상태, 조 수, Cycle 수를 저장해 1단계 초안을 만드는 입력 묶음입니다."
        },
        {
          title: "Cycle 구성 카드",
          description: "Cycle 패턴과 Pool 기준을 정의해 이후 달력 시뮬레이션 기준을 만듭니다."
        },
        {
          title: "달력 시뮬레이션",
          description: "월간 순환 배치가 실제 기대와 맞는지 확인하는 검증 영역입니다."
        }
      ],
      notes: ["패턴 String과 시작일은 달력 시뮬레이션 기준을 결정하므로 먼저 확인해야 합니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="step1" />
    },
    {
      id: "sites-step2",
      kind: "feature",
      navLabel: "2단계 조직 구성",
      title: "2단계 조직 구성은 후보 인력을 드래그해 조별 배정을 마무리하는 단계입니다.",
      description:
        "좌측 후보 목록에서 인력을 선택하고, 적용 일자를 기준으로 오른쪽 조 보드에 배정합니다.",
      goal: "배정 후보와 조별 정원을 먼저 확인한 뒤 드래그 배정을 진행하는 절차를 고정합니다.",
      steps: [
        { title: "후보 인력 범위 확인", description: "검색, 대상, 적용 일자를 먼저 정해 후보 목록을 정리합니다." },
        { title: "조별 배정 보드 확인", description: "정원과 현재 인원 수를 확인한 뒤 배정합니다." },
        { title: "완료 전 최종 검토", description: "배정 보드가 기대와 맞는지 확인하고 완료 버튼으로 저장합니다." }
      ],
      detailItems: [
        {
          title: "후보 인력 필터",
          description: "검색과 적용 일자를 기준으로 조 배정에 쓸 후보 범위를 정하는 준비 영역입니다."
        },
        {
          title: "조별 배정 보드",
          description: "정원과 현재 인원 수를 보며 실제 배정을 완료하는 핵심 작업 영역입니다."
        },
        {
          title: "조직 구성 완료 버튼",
          description: "배정 내용을 저장해 1단계 정보와 함께 근무지 구성을 마무리하는 실행 버튼입니다."
        }
      ],
      notes: ["신규 등록은 완료 버튼을 눌러야 1단계와 2단계 정보가 함께 저장됩니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="step2" />
    },
    {
      id: "sites-detail",
      kind: "feature",
      navLabel: "상세 보기",
      title: "상세 보기에서는 저장된 Cycle 구성, 조 현황, 후속 액션을 다시 검토합니다.",
      description:
        "이미 저장된 근무지는 상세 보기에서 Cycle과 조별 현황을 보고, 삭제나 근무표 이동 같은 후속 액션을 처리합니다.",
      goal: "저장된 근무지의 현재 구성을 다시 읽고 후속 조치를 결정하는 화면이라는 점을 명확히 합니다.",
      steps: [
        { title: "근무지 기본 정보 확인", description: "상태, Cycle 수, Pool 운영 여부를 먼저 봅니다." },
        { title: "Cycle과 근무시간 확인", description: "저장된 패턴과 시간대를 다시 검토합니다." },
        { title: "후속 액션 결정", description: "삭제 또는 근무표 이동 등 후속 작업을 실행합니다." }
      ],
      detailItems: [
        {
          title: "기본 정보 요약",
          description: "상태, Cycle 수, Pool 운영 여부를 다시 읽어 현재 저장 구성을 확인합니다."
        },
        {
          title: "조 현황·근무시간 블록",
          description: "조별 시간대와 인원 상태를 다시 검토하는 상세 정보 영역입니다."
        },
        {
          title: "후속 액션 버튼",
          description: "근무표 이동이나 삭제처럼 다음 작업을 결정하는 실행 영역입니다."
        }
      ],
      notes: ["삭제는 되돌릴 수 없으므로 상세 보기에서 현재 구성을 다시 확인한 뒤 진행해야 합니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="detail" />
    },
    {
      id: "sites-pattern-import",
      kind: "feature",
      navLabel: "패턴 산출",
      title: "패턴 적용된 근무지 추가는 표준 Excel 근무표를 분석해 1단계 draft를 자동 채우는 기능입니다.",
      description:
        "상단 버튼으로 여는 패턴 산출 모달은 파일 선택, 분석, 미리보기 검토, 1단계 이동 순서로 구성됩니다.",
      goal: "수동 입력 대신 표준 근무표에서 Cycle과 offset을 먼저 뽑아 draft 정확도를 높입니다.",
      steps: [
        { title: "표준 근무표 파일 선택", description: "첫 번째 시트를 기준으로 분석할 Excel 파일을 선택합니다." },
        { title: "패턴 산출 및 미리보기", description: "Cycle, offset, 정원 제안을 분석하고 결과를 확인합니다." },
        { title: "1단계 draft 이동", description: "검토 후 근무지 등록 1단계로 결과를 넘깁니다." }
      ],
      detailItems: [
        {
          title: "파일 선택 구간",
          description: "표준 근무표 파일을 가져와 분석 시작 기준을 정하는 입력 구간입니다."
        },
        {
          title: "분석·미리보기 구간",
          description: "Cycle, offset, 정원 제안을 산출하고 결과 탭을 검토하는 핵심 단계입니다."
        },
        {
          title: "1단계 draft 이동 버튼",
          description: "검토가 끝난 결과를 근무지 등록 1단계 초안으로 넘기는 실행 버튼입니다."
        }
      ],
      notes: ["이 기능의 자세한 탭 검토 흐름은 모달 안 `가이드 보기`에서 다시 볼 수 있습니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="pattern-import" />
    }
  ]
};

export const sitePatternImportGuide: RouteGuideDefinition = {
  routeKey: "sites",
  title: "패턴 적용된 근무지 추가 가이드",
  description: "Excel 근무표 분석 결과를 1단계 draft로 연결하는 세부 가이드입니다.",
  pages: [
    {
      id: "site-pattern-import-intro",
      kind: "intro",
      navLabel: "가이드 소개",
      title: "패턴 적용된 근무지 추가는 표준 근무표 파일에서 Cycle과 offset을 읽어 1단계 draft를 자동 채우는 기능입니다.",
      description:
        "이 기능은 수동 입력 부담을 줄이고, Cycle·조 배정의 초안을 더 빠르게 만드는 데 목적이 있습니다.",
      goal: "파일 준비와 결과 검토 기준을 먼저 이해한 뒤 분석을 실행하는 작업 습관을 고정합니다.",
      steps: [
        { title: "파일 선택", description: "첫 번째 시트를 기준으로 읽을 표준 근무표 파일을 선택합니다." },
        { title: "분석 실행", description: "패턴 산출 버튼으로 Cycle과 offset 분석을 시작합니다." },
        { title: "미리보기 후 1단계 이동", description: "분석 결과를 검토한 뒤 draft로 넘깁니다." }
      ],
      detailItems: [
        {
          title: "원본 파일 기준",
          description: "표준 근무표 구조를 지켜야 Cycle과 offset 산출 정확도가 유지됩니다."
        },
        {
          title: "분석 시작 버튼",
          description: "패턴 산출 버튼은 원본 데이터를 해석해 결과 탭을 여는 시작 액션입니다."
        },
        {
          title: "draft 연결 흐름",
          description: "미리보기 검토 후 결과를 1단계 draft로 넘겨 수동 입력량을 줄이는 단계입니다."
        }
      ],
      notes: ["1행 날짜, 2행 요일, 3행 공휴일, 4행부터 근무자 구조를 지키는 것이 가장 중요합니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="pattern-import" />
    },
    {
      id: "site-pattern-import-toc",
      kind: "toc",
      navLabel: "목차",
      title: "패턴 산출 모달은 파일 선택, 분석, 미리보기, 1단계 이동 순서로 보면 됩니다.",
      description: "목차 페이지는 이 모달에서 어떤 단계를 어떤 순서로 확인해야 하는지 기준을 잡아 줍니다.",
      goal: "분석 전에 준비 단계와 결과 검토 단계를 명확히 구분합니다.",
      steps: [
        { title: "파일 선택", description: "표준 근무표 Excel 파일을 준비합니다." },
        { title: "패턴 산출", description: "Cycle, offset, 정원 제안을 분석합니다." },
        { title: "미리보기 검토", description: "탭별 결과를 읽고 문제를 확인합니다." },
        { title: "1단계 이동", description: "검토 후 draft에 자동 반영합니다." }
      ],
      detailItems: [
        {
          title: "파일 선택 단계",
          description: "분석 대상 Excel 파일을 정해 원본 데이터를 확정하는 시작 단계입니다."
        },
        {
          title: "패턴 산출 단계",
          description: "Cycle, offset, 정원 제안을 생성하는 분석 실행 단계입니다."
        },
        {
          title: "미리보기 검토 단계",
          description: "결과 탭, 불일치 내역, 원본 데이터를 읽어 반영 가능 여부를 판단하는 단계입니다."
        },
        {
          title: "1단계 이동 단계",
          description: "검토가 끝난 결과를 근무지 등록 draft로 넘기는 최종 실행 단계입니다."
        }
      ],
      notes: ["목차를 먼저 읽으면 분석 결과 탭을 훨씬 빠르게 해석할 수 있습니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="pattern-import-toc" />
    },
    {
      id: "site-pattern-import-sheet",
      kind: "feature",
      navLabel: "파일·분석 시작",
      title: "파일 가져오기와 패턴 산출 버튼은 분석의 시작점입니다.",
      description:
        "표준 근무표 파일을 선택한 뒤 패턴 산출 버튼을 눌러야 이후 결과 탭과 1단계 이동이 열립니다.",
      goal: "분석 시작 전에 파일과 시트 기준을 명확히 맞추는 절차를 고정합니다.",
      steps: [
        { title: "파일 가져오기", description: "표준 근무표 Excel 파일을 선택합니다." },
        { title: "패턴 산출 실행", description: "Cycle과 offset 분석을 시작합니다." },
        { title: "오류 메시지 확인", description: "형식 오류나 경고가 있으면 먼저 원본 파일을 수정합니다." }
      ],
      detailItems: [
        {
          title: "파일 가져오기 버튼",
          description: "분석 대상 원본 파일을 모달에 불러오는 시작 버튼입니다."
        },
        {
          title: "패턴 산출 버튼",
          description: "Cycle과 offset 분석을 실제로 시작하는 핵심 실행 버튼입니다."
        },
        {
          title: "형식 점검 영역",
          description: "형식 오류와 경고를 먼저 읽고 원본 파일 수정이 필요한지 판단하는 검증 영역입니다."
        }
      ],
      notes: ["첫 번째 시트만 읽으므로 분석 대상 시트가 첫 탭에 있는지 먼저 확인합니다."],
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="pattern-import-sheet" />
    },
    {
      id: "site-pattern-import-preview",
      kind: "feature",
      navLabel: "미리보기·1단계 이동",
      title: "분석 결과, 그룹별 상세, 불일치 내역을 확인한 뒤 마지막에 1단계 draft로 넘깁니다.",
      description:
        "미리보기 탭에서는 Cycle별 패턴과 offset, 불일치 내역, 원본 데이터를 함께 볼 수 있어 draft 반영 전 검증 근거로 좋습니다.",
      goal: "분석 결과를 확인하고 문제가 없을 때만 근무지 등록 1단계 draft로 이동하는 절차를 고정합니다.",
      steps: [
        { title: "분석 결과 확인", description: "Cycle 수, 패턴, offset, 정원 제안을 먼저 확인합니다." },
        { title: "불일치와 원본 데이터 검토", description: "예상 패턴과 실제 코드가 다른 날짜가 있는지 확인합니다." },
        { title: "근무지 등록(1단계 이동)", description: "검토 후 결과를 draft에 자동 반영합니다." }
      ],
      detailItems: [
        {
          title: "분석 결과 탭",
          description: "Cycle 수, 패턴, offset, 정원 제안을 읽어 초안 품질을 판단하는 핵심 탭입니다."
        },
        {
          title: "불일치·원본 검토",
          description: "예상 패턴과 실제 코드 차이를 확인해 draft 반영 전 문제 여부를 판단합니다."
        },
        {
          title: "1단계 이동 버튼",
          description: "검토가 끝난 결과를 근무지 등록 1단계 draft로 실제 반영하는 버튼입니다."
        }
      ],
      notes: ["불일치가 많으면 1단계 이동 전 원본 파일을 먼저 정리하는 편이 안전합니다."],
      outcome: "분석 결과가 근무지 등록 1단계 draft에 채워지고, 이후 패턴 등록 화면에서 최종 보정할 수 있습니다.",
      renderFigure: ({ activeFocusIndex }) => <SiteGuideScene activeFocusIndex={activeFocusIndex} variant="pattern-import-preview" />
    }
  ]
};

const performanceGuide: RouteGuideDefinition = {
  routeKey: "performance",
  title: "실적 관리 가이드",
  description: "승인대기 실적을 근무지 단위로 검토하고 수당 흐름으로 넘기는 화면입니다.",
  pages: [
    {
      id: "performance-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "실적 관리는 승인대기 파일을 검토하고 승인 기준을 확정하는 화면입니다.",
      description:
        "근무지 기준으로 실적을 묶어 검토하고, 승인 즉시 수당 산출 흐름으로 반영합니다.",
      goal: "운영자는 이 화면에서 승인 범위를 먼저 정하고, 근무지 단위 승인과 행별 검토를 섞어 처리합니다.",
      steps: [
        {
          title: "승인 범위 고정",
          description: "조회구분, 근무지, 근로유형, 연월을 먼저 고정해 현재 검토해야 할 파일 묶음을 좁힙니다."
        },
        {
          title: "근무지 승인과 예외 검토",
          description: "정상 건은 근무지 승인으로 처리하고, 알림이나 비교가 필요한 행만 개별로 다시 확인합니다."
        },
        {
          title: "승인 이력 대조",
          description: "하단 승인 이력에서 처리자와 비고를 다시 확인해 이후 수당 승인 흐름과 연결합니다."
        }
      ],
      detailItems: [
        {
          title: "상단 승인 필터",
          description: "조회구분과 근무 범위를 먼저 좁혀 현재 검토해야 할 파일 묶음을 분명히 합니다."
        },
        {
          title: "근무지 승인 구간",
          description: "근무지 summary에서 정상 묶음을 먼저 승인하면 반복 작업을 크게 줄일 수 있습니다."
        },
        {
          title: "승인 이력 영역",
          description: "처리시각, 처리자, 비고를 하단에서 다시 확인해 이후 수당 흐름과 연결 근거를 남깁니다."
        }
      ],
      notes: [
        "실적 승인 직후 수당 산출과 품의 이력 갱신이 이어집니다.",
        "재승인 파일이 있으면 파일 단위 확정 흐름을 먼저 확인하는 편이 안전합니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <PerformanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="overview" />
      )
    },
    {
      id: "performance-toc",
      kind: "toc",
      navLabel: "목차",
      title: "실적 관리는 필터, 승인, 이력 순서로 보면 됩니다.",
      description: "필터로 범위를 정한 뒤 근무지 승인, 행 검토, 승인 이력 조회 흐름으로 이어집니다.",
      goal: "목차 페이지는 실적 관리에서 어떤 블록을 어떤 순서로 다뤄야 하는지 기준을 잡아 줍니다.",
      steps: [
        {
          title: "상세 필터",
          description: "조회구분, 근무지, 근로유형, 연월을 조합해 승인 범위를 좁힙니다."
        },
        {
          title: "근무지 승인",
          description: "근무지 summary에서 대기 건과 재검토 건을 보고 묶음 단위 승인을 먼저 처리합니다."
        },
        {
          title: "행별 검토",
          description: "알림, 비교, 원본 파일 열기 버튼으로 예외 행만 개별 검토합니다."
        },
        {
          title: "승인 이력",
          description: "하단 이력에서 처리시각, 처리자, 비고를 확인합니다."
        }
      ],
      detailItems: [
        {
          title: "상세 필터 블록",
          description: "조회구분, 근무지, 근로유형, 연월을 조합해 현재 승인 범위를 먼저 좁히는 단계입니다."
        },
        {
          title: "근무지 승인 블록",
          description: "근무지 summary를 기준으로 정상 묶음을 빠르게 승인하는 중심 단계입니다."
        },
        {
          title: "행별 검토 블록",
          description: "예외 행만 비교와 알림을 보며 개별 승인 또는 반려로 처리하는 단계입니다."
        },
        {
          title: "승인 이력 블록",
          description: "처리시각, 처리자, 비고를 다시 확인해 이후 수당 흐름과 연결 근거를 남기는 단계입니다."
        }
      ],
      notes: ["재승인 대기 파일이 있으면 일반 승인보다 재승인 확정 블록을 먼저 확인하는 것이 좋습니다."],
      figure: <PerformanceGuideScene variant="toc" />
    },
    {
      id: "performance-filters",
      kind: "feature",
      navLabel: "상세 필터",
      title: "실적 검토는 조회구분부터 연월까지 순서대로 좁혀야 오류가 줄어듭니다.",
      description:
        "실적 관리 상단 필터는 승인 상태와 근무 범위를 함께 제한합니다. 먼저 범위를 확정해야 승인 버튼의 의미가 명확해집니다.",
      goal: "필터를 먼저 정리하면 근무지 승인, 행 승인, 승인 이력 모두 같은 기준으로 해석됩니다.",
      steps: [
        {
          title: "조회구분 선택",
          description: "승인대기와 승인완료를 먼저 구분해 현재 처리 단계가 어느 쪽인지 고정합니다."
        },
        {
          title: "근무지 선택",
          description: "현재 확인할 사업장만 남겨 승인 범위를 빠르게 좁힙니다."
        },
        {
          title: "근로유형 제한",
          description: "대체근무, 연장근무, 휴일근무를 분리해 승인 기준을 혼동하지 않게 합니다."
        },
        {
          title: "연도 선택",
          description: "승인 시점의 연간 범위를 먼저 맞추면 월별 비교 기준이 흔들리지 않습니다."
        },
        {
          title: "월 선택",
          description: "마지막에 월을 맞춰 승인 이력과 비교할 실제 처리 대상을 확정합니다."
        }
      ],
      detailItems: [
        {
          title: "조회구분 필터",
          description: "승인대기와 승인완료를 먼저 구분해야 버튼 의미와 현재 검토 단계가 명확해집니다."
        },
        {
          title: "근무지 필터",
          description: "근무지별 승인 책임을 나눠 볼 때는 사업장을 먼저 좁혀 묶음 단위를 분명히 합니다."
        },
        {
          title: "근로유형 필터",
          description: "유형 필터로 승인 기준이 다른 행을 분리해 잘못된 묶음 승인 위험을 줄입니다."
        },
        {
          title: "연도 필터",
          description: "연도는 승인 이력과 비교할 시점 기준을 맞추는 필터입니다."
        },
        {
          title: "월 필터",
          description: "실제 승인 대상 월을 마지막에 고정해 결과 해석과 이후 수당 연계 흐름을 맞춥니다."
        }
      ],
      notes: ["일괄 승인 버튼은 현재 필터 결과에만 적용되므로 범위 확인이 먼저입니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <PerformanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="filters" />
      )
    },
    {
      id: "performance-approval",
      kind: "feature",
      navLabel: "승인 흐름",
      title: "실적 승인은 근무지 단위를 먼저 보고, 예외 행만 개별로 처리하는 흐름이 가장 실무적입니다.",
      description:
        "실적 현황 테이블은 근무지 summary와 상세 행이 같은 화면에 있어, 단위 승인과 예외 검토를 섞어서 처리하기 좋게 구성돼 있습니다.",
      goal: "정상 건은 빠르게 승인하고, 비교나 알림이 필요한 행만 개별 검토해 승인 품질을 유지합니다.",
      steps: [
        {
          title: "근무지 summary 확인",
          description: "대기 건, 재검토 건, 재승인 대기 건을 보고 현재 묶음의 상태를 먼저 확인합니다."
        },
        {
          title: "근무지 승인 실행",
          description: "문제 없는 묶음은 근무지 승인으로 처리해 승인 속도를 높입니다."
        },
        {
          title: "행별 예외 검토",
          description: "알림, 승인본 비교, 원본 파일 열기 버튼으로 예외 행만 별도로 확인합니다."
        }
      ],
      detailItems: [
        {
          title: "근무지 요약 카드",
          description: "현재 묶음의 승인 수, 재검토 수, 재승인 대기 여부를 먼저 읽는 기준 블록입니다."
        },
        {
          title: "근무지 승인 버튼",
          description: "정상 건이 많은 묶음은 근무지 승인으로 먼저 정리해 승인 속도를 높입니다."
        },
        {
          title: "예외 행 검토",
          description: "비교, 알림, 원본 파일 열기 버튼으로 특이 행만 다시 확인해 승인 품질을 유지합니다."
        }
      ],
      notes: [
        "재검토나 재승인 대기 상태가 있으면 근무지 승인 전 상세 행을 먼저 보는 편이 안전합니다.",
        "행 승인 후에는 수당 관리 메뉴에서 승인 상태가 바로 이어집니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <PerformanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="approval" />
      )
    },
    {
      id: "performance-history",
      kind: "feature",
      navLabel: "승인 이력",
      title: "승인 이력은 처리 근거를 다시 추적하는 마지막 검증 구간입니다.",
      description:
        "하단 승인 이력 표에서 처리시각, 처리자, 비고, 원본 파일을 다시 확인할 수 있습니다.",
      goal: "승인 결과를 나중에 다시 설명하거나 수당 승인 흐름과 대조할 때 이력이 기준이 됩니다.",
      steps: [
        {
          title: "처리시각과 처리자 확인",
          description: "언제 누가 승인했는지 먼저 확인해 업무 흐름을 다시 추적합니다."
        },
        {
          title: "비고 확인",
          description: "재승인, 임의 시급 같은 예외가 남아 있는지 비고에서 확인합니다."
        },
        {
          title: "원본 파일 대조",
          description: "필요하면 원본 파일명과 승인 일자를 함께 대조해 재현 가능성을 유지합니다."
        }
      ],
      detailItems: [
        {
          title: "이력 전체 범위",
          description: "승인 이력 카드 전체는 처리시각과 처리자, 파일 근거를 다시 검토하는 마지막 확인 구간입니다."
        },
        {
          title: "처리자와 비고 구간",
          description: "재승인, 임의 시급, 검토 메모 같은 예외는 처리자/비고 구간에서 가장 빠르게 식별됩니다."
        },
        {
          title: "원본 파일 구간",
          description: "원본 파일명을 다시 대조하면 승인 근거를 나중에 재현하거나 설명하기 쉬워집니다."
        }
      ],
      notes: ["이력은 접기/펼치기로 관리하되, 마감 전에는 한 번 더 펼쳐 확인하는 것이 좋습니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <PerformanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="history" />
      )
    }
  ]
};

const allowanceGuide: RouteGuideDefinition = {
  routeKey: "allowance",
  title: "수당 관리 가이드",
  description: "수당 산출 검토부터 품의 승인, 문서 출력, 품의 이력 확인까지 이어지는 화면입니다.",
  pages: [
    {
      id: "allowance-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "수당 관리는 수당 산출 검토와 최종 품의 승인을 한 화면에서 마감하는 메뉴입니다.",
      description:
        "산출 결과 검토, 승인과 반려, 품의 승인, 문서 출력, 품의 이력을 한 흐름으로 관리합니다.",
      goal: "운영자는 승인 상태를 정리한 뒤 품의 승인으로 업무를 마감하고, 이후 이력 화면에서 다시 확인합니다.",
      steps: [
        {
          title: "상태 검토",
          description: "연월과 근무지 조건으로 산출 결과를 좁힌 뒤 검토대기, 승인, 반려 상태를 먼저 정리합니다."
        },
        {
          title: "승인과 반려",
          description: "근무지 승인과 행별 승인/반려를 섞어 승인 상태를 확정합니다."
        },
        {
          title: "품의 승인과 마감",
          description: "승인 상태 건만 모아 품의 승인 미리보기 후 최종 승인과 자동 백업을 실행합니다."
        }
      ],
      detailItems: [
        {
          title: "상태 검토 영역",
          description: "상단 필터와 상태 요약으로 현재 어떤 범위와 상태 분포를 다루는지 먼저 분명히 합니다."
        },
        {
          title: "수당 산출 현황",
          description: "근무지 승인과 행별 승인/반려를 같은 테이블에서 처리해 검토 흐름을 한 번에 정리합니다."
        },
        {
          title: "품의 승인 액션",
          description: "승인 상태 건만 모아 미리보기와 최종 승인, 자동 백업까지 이어지는 마감 단계입니다."
        }
      ],
      notes: [
        "문서 출력은 승인 상태 또는 품의승인 상태 건만 대상으로 동작합니다.",
        "품의 승인 이후에는 품의 이력과 품의 승인 기록에서 같은 묶음을 다시 조회할 수 있습니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="overview" />
      )
    },
    {
      id: "allowance-toc",
      kind: "toc",
      navLabel: "목차",
      title: "수당 관리는 상태 검토, 승인, 품의 승인, 이력 조회 순서로 보면 됩니다.",
      description: "수당 산출 현황과 품의 이력을 오가면서 승인 상태와 마감 이력을 함께 관리합니다.",
      goal: "목차 페이지는 수당 관리 메뉴의 핵심 업무 흐름을 빠르게 파악하도록 돕습니다.",
      steps: [
        {
          title: "상태 검토",
          description: "연도, 월, 근무지 기준으로 산출 범위를 좁히고 상태 분포를 확인합니다."
        },
        {
          title: "행/근무지 승인",
          description: "근무지 승인과 행별 승인/반려를 같은 테이블에서 처리합니다."
        },
        {
          title: "품의 승인",
          description: "승인 건만 모아 미리보기 후 최종 품의 승인과 자동 백업을 실행합니다."
        },
        {
          title: "품의 이력",
          description: "상태 필터와 품의 승인 기록으로 완료된 묶음을 다시 확인합니다."
        }
      ],
      detailItems: [
        {
          title: "상태 검토 흐름",
          description: "연월과 근무지 기준으로 현재 산출 범위와 상태 분포를 읽는 시작 단계입니다."
        },
        {
          title: "행·근무지 승인 흐름",
          description: "근무지 단위와 행 단위 승인을 한 화면에서 나눠 처리하는 핵심 단계입니다."
        },
        {
          title: "품의 승인 흐름",
          description: "승인 상태 건만 모아 최종 마감과 자동 백업으로 이어지는 단계입니다."
        },
        {
          title: "품의 이력 흐름",
          description: "완료된 묶음을 다시 조회해 출력 기준과 백업 결과를 설명하는 사후 검토 단계입니다."
        }
      ],
      notes: ["수당 관리의 마감 시점은 `품의 승인` 버튼을 눌러 최종 승인했을 때입니다."],
      figure: <AllowanceGuideScene variant="toc" />
    },
    {
      id: "allowance-status",
      kind: "feature",
      navLabel: "상태 검토",
      title: "수당 검토는 연월과 근무지 기준을 먼저 고정하고 상태 분포를 읽는 것으로 시작합니다.",
      description:
        "상단 필터와 상태 요약 pill, 사업장별 분포 카드로 현재 검토해야 할 범위와 편차를 먼저 확인합니다.",
      goal: "승인과 반려를 누르기 전에 검토 범위와 상태 비율을 먼저 읽어 판단 오류를 줄입니다.",
      steps: [
        {
          title: "연도 선택",
          description: "정산 연도를 먼저 고정해 현재 검토 범위의 기준 연도를 분명히 합니다."
        },
        {
          title: "월 선택",
          description: "정산 월을 맞춰 실제 승인 대상 기간을 좁힙니다."
        },
        {
          title: "근무지 제한",
          description: "근무지별 편차를 볼 때는 사업장을 먼저 좁혀 상태와 금액을 해석합니다."
        },
        {
          title: "상태 요약 해석",
          description: "검토대기, 승인, 반려, 품의승인 건수를 보고 현재 작업 우선순위를 정합니다."
        },
        {
          title: "시각화 카드 확인",
          description: "사업장별 분포와 유형별 비중을 함께 보며 어느 구간을 먼저 검토할지 압축합니다."
        }
      ],
      detailItems: [
        {
          title: "연도 필터",
          description: "상태 검토의 첫 기준점으로 연간 범위를 먼저 맞춥니다."
        },
        {
          title: "월 필터",
          description: "실제 승인 대상 월을 고정해 이후 승인 버튼 대상과 해석 기준을 맞춥니다."
        },
        {
          title: "근무지 필터",
          description: "근무지별 편차가 클 때는 사업장을 먼저 좁혀 승인 범위를 분리합니다."
        },
        {
          title: "상태 요약 배지",
          description: "검토대기, 승인, 반려, 품의승인 건수는 지금 무엇을 먼저 처리해야 하는지 빠르게 알려 줍니다."
        },
        {
          title: "시각화 카드",
          description: "사업장별 분포와 유형 비중 카드로 금액 편차의 방향을 한 번 더 확인합니다."
        }
      ],
      notes: ["상태 검토 단계에서는 시각화 카드보다 실제 승인 대상 건수와 상태 분포를 먼저 보는 편이 좋습니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="status" />
      )
    },
    {
      id: "allowance-approval",
      kind: "feature",
      navLabel: "승인 흐름",
      title: "수당 승인은 근무지 단위를 먼저 정리하고, 예외 행만 행 단위로 처리하는 흐름이 효율적입니다.",
      description:
        "수당 산출 현황 테이블에서는 근무지 summary와 행별 승인/반려 버튼을 함께 제공해 검토 흐름을 한 곳에서 마무리할 수 있습니다.",
      goal: "정상 건은 빠르게 승인하고, 특이 행은 개별 코멘트와 근거를 보고 반려까지 처리합니다.",
      steps: [
        {
          title: "근무지 summary 확인",
          description: "근무지별 승인 수, 반려 수, 품의승인 수를 먼저 보고 현재 묶음의 상태를 읽습니다."
        },
        {
          title: "근무지 승인 실행",
          description: "문제 없는 묶음은 근무지 승인으로 빠르게 승인 상태로 올립니다."
        },
        {
          title: "행별 승인 또는 반려",
          description: "예외 행만 상세 보기와 코멘트를 확인한 뒤 승인 또는 반려합니다."
        }
      ],
      detailItems: [
        {
          title: "근무지 summary",
          description: "근무지별 승인 수와 반려 수, 품의승인 수를 함께 보며 현재 묶음 상태를 읽는 기준 블록입니다."
        },
        {
          title: "근무지 승인 버튼",
          description: "정상 건이 많은 묶음은 근무지 승인으로 빠르게 승인 상태로 올릴 수 있습니다."
        },
        {
          title: "행별 승인/반려",
          description: "예외 행은 상세 보기와 코멘트를 확인한 뒤 승인 또는 반려로 개별 처리합니다."
        }
      ],
      notes: ["반려 상태 건은 문서 출력과 품의 승인 대상에서 제외됩니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="approval" />
      )
    },
    {
      id: "allowance-proposal",
      kind: "feature",
      navLabel: "품의 승인",
      title: "품의 승인은 승인 상태 건만 모아 최종 마감하는 단계입니다.",
      description:
        "상단 `품의 승인` 버튼은 승인 상태 수당만 모아 미리보기 모달을 열고, 최종 승인과 자동 백업을 함께 실행합니다.",
      goal: "마감 전에는 포함 대상, 합계, 선지급 분리 여부를 확인하고 최종 품의 승인으로 업무를 닫습니다.",
      steps: [
        {
          title: "품의 승인 버튼 실행",
          description: "승인 상태 수당이 있을 때만 품의 승인 버튼이 활성화됩니다."
        },
        {
          title: "미리보기 검토",
          description: "근무지별 합계, 승인 대상 건수, 개별 행 목록을 모달에서 다시 확인합니다."
        },
        {
          title: "최종 품의 승인",
          description: "최종 버튼을 누르면 승인 이력 저장, 문서 기준 확정, 자동 백업까지 함께 진행됩니다."
        }
      ],
      detailItems: [
        {
          title: "품의 승인 진입",
          description: "승인 상태 수당이 있을 때만 상단 품의 승인 버튼으로 최종 마감 흐름을 시작할 수 있습니다."
        },
        {
          title: "미리보기 합계 검토",
          description: "근무지별 합계와 지급 구분, 포함 건수를 다시 확인해 마감 대상을 한 번 더 검증합니다."
        },
        {
          title: "최종 품의 승인 버튼",
          description: "최종 버튼을 누르면 승인 상태 확정, 문서 기준 저장, 자동 백업이 연달아 실행됩니다."
        }
      ],
      notes: [
        "품의 승인 이후에는 상태가 `품의승인`으로 바뀝니다.",
        "미리보기는 승인 메모를 남기고 최종 승인 여부를 판단하는 마지막 확인 단계입니다."
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="proposal" />
      )
    },
    {
      id: "allowance-history",
      kind: "feature",
      navLabel: "품의 이력",
      title: "품의 이력 화면에서는 승인 상태 이력과 품의 승인 기록을 함께 확인합니다.",
      description:
        "상태 필터, 근무지 필터, 직원 필터와 함께 품의 승인 기록 테이블을 내려가며 완료된 묶음을 다시 확인합니다.",
      goal: "언제든지 승인 상태와 최종 품의 묶음을 다시 추적해 출력 근거와 백업 결과를 설명할 수 있게 합니다.",
      steps: [
        {
          title: "근무지 필터 선택",
          description: "필요한 사업장 기준으로 기록 범위를 먼저 좁힙니다."
        },
        {
          title: "연도 필터 선택",
          description: "품의 이력의 연간 기준을 맞춰 이전 월과 다른 데이터가 섞이지 않게 합니다."
        },
        {
          title: "월 필터 선택",
          description: "실제 확인할 대상 월을 마지막에 맞춰 품의 기록 범위를 확정합니다."
        },
        {
          title: "품의 이력 확인",
          description: "개별 산출 결과의 등록, 검토, 품의, 문서 출력 시점을 한 줄에서 확인합니다."
        },
        {
          title: "품의 승인 기록 재조회",
          description: "대상월, 건수, 총액, 백업 결과를 보고 최종 묶음을 다시 검증합니다."
        }
      ],
      detailItems: [
        {
          title: "근무지 필터",
          description: "같은 월이라도 사업장별로 구분해 보면 품의 범위를 더 빠르게 좁힐 수 있습니다."
        },
        {
          title: "연도 필터",
          description: "연도 기준을 먼저 맞추면 월별 기록 비교 시 다른 회계 연도와 섞이지 않습니다."
        },
        {
          title: "월 필터",
          description: "실제 검토 대상 월을 마지막에 고정해 품의 이력 범위를 분명히 합니다."
        },
        {
          title: "품의 이력 테이블",
          description: "개별 수당 산출 결과가 검토, 승인, 품의 승인으로 어떻게 흘렀는지 한 줄에서 확인합니다."
        },
        {
          title: "품의 승인 기록",
          description: "최종 승인 묶음의 건수, 총액, 승인 정보, 백업 결과를 다시 검증하는 마지막 블록입니다."
        }
      ],
      notes: ["품의 승인 기록의 `미리보기` 버튼으로 최종 승인 당시 스냅샷을 다시 열 수 있습니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="history" />
      )
    }
  ]
};

export const allowanceProposalGuide: RouteGuideDefinition = {
  routeKey: "allowance",
  title: "품의 승인 가이드",
  description: "승인 상태 수당을 최종 마감하고 자동 백업까지 확인하는 세부 가이드입니다.",
  pages: [
    {
      id: "allowance-proposal-guide-intro",
      kind: "intro",
      navLabel: "가이드 소개",
      title: "품의 승인은 승인 상태 수당만 모아 최종 마감과 자동 백업을 함께 실행하는 단계입니다.",
      description:
        "이 기능은 포함 대상 확인, 합계 검토, 승인 메모 입력, 최종 승인과 백업 완료 확인을 하나의 모달에서 처리합니다.",
      goal: "마감 전에 포함 대상과 합계를 다시 확인하고, 승인 이후 어떤 결과가 남는지 명확히 이해합니다.",
      steps: [
        {
          title: "승인 대상 확인",
          description: "승인 상태 수당만 품의 승인 모달에 포함되는지 먼저 확인합니다.",
          focusIndex: 0
        },
        {
          title: "미리보기 검토",
          description: "근무지별 합계와 행 목록, 선지급 분리 여부를 다시 확인합니다.",
          focusIndex: 1
        },
        {
          title: "최종 승인과 백업",
          description: "최종 품의 승인 버튼으로 상태 확정, 문서 기준 고정, 자동 백업까지 같이 실행합니다.",
          focusIndex: 2
        }
      ],
      detailItems: [
        {
          title: "대상 포함 기준",
          description: "승인 상태 수당만 품의 승인 모달에 포함되는지 확인하는 시작 기준입니다."
        },
        {
          title: "미리보기 요약 블록",
          description: "근무지별 합계와 포함 건수를 읽어 마감 대상이 맞는지 검토하는 핵심 영역입니다."
        },
        {
          title: "최종 승인·백업 블록",
          description: "상태 확정과 자동 백업, 승인 기록 저장이 이어지는 최종 실행 영역입니다."
        }
      ],
      notes: ["반려 또는 검토대기 상태 건은 품의 승인 대상에 포함되지 않습니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="proposal" />
      )
    },
    {
      id: "allowance-proposal-guide-toc",
      kind: "toc",
      navLabel: "목차",
      title: "품의 승인 모달은 미리보기 확인, 메모 입력, 최종 승인 순서로 보면 됩니다.",
      description: "목차 페이지는 최종 마감 전에 어떤 단계를 어떤 순서로 확인해야 하는지 기준을 잡아 줍니다.",
      goal: "최종 승인 전에 검토 단계와 실행 단계를 분리해 실수를 줄입니다.",
      steps: [
        {
          title: "미리보기 확인",
          description: "근무지별 합계와 대상 건수를 먼저 확인합니다."
        },
        {
          title: "행 목록 검토",
          description: "개별 지급 대상과 비고를 다시 읽어 예외 건이 없는지 확인합니다."
        },
        {
          title: "승인 메모 입력",
          description: "필요하면 마감 근거를 메모로 남깁니다."
        },
        {
          title: "최종 승인·백업",
          description: "최종 품의 승인 버튼으로 상태와 백업 결과를 함께 확정합니다."
        }
      ],
      detailItems: [
        {
          title: "미리보기 단계",
          description: "근무지별 합계와 총액을 먼저 읽어 이번 마감 묶음의 규모를 확인하는 단계입니다."
        },
        {
          title: "행 목록 검토 단계",
          description: "개별 지급 대상과 비고를 다시 읽어 예외 건이 없는지 확인하는 단계입니다."
        },
        {
          title: "승인 메모 단계",
          description: "필요한 판단 근거를 남겨 이후 품의 이력에서 재현 가능성을 높이는 단계입니다."
        },
        {
          title: "최종 승인·백업 단계",
          description: "상태 확정과 자동 백업, 승인 기록 저장이 함께 실행되는 마지막 단계입니다."
        }
      ],
      notes: ["최종 승인 후에는 같은 묶음을 품의 이력과 품의 승인 기록에서 다시 조회할 수 있습니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="proposal" />
      )
    },
    {
      id: "allowance-proposal-guide-preview",
      kind: "feature",
      navLabel: "미리보기 검토",
      title: "미리보기 모달에서는 근무지별 합계와 개별 대상 목록을 먼저 검토합니다.",
      description:
        "상단 요약 카드와 표를 같이 읽으면 이번 품의 승인 묶음에 어떤 지급이 포함되는지 빠르게 확인할 수 있습니다.",
      goal: "최종 승인 전에 합계와 개별 대상이 의도한 범위와 일치하는지 검증합니다.",
      steps: [
        {
          title: "총 승인 금액 확인",
          description: "총 승인 금액, 일반 지급, 선지급 금액을 먼저 비교합니다.",
          focusIndex: 1
        },
        {
          title: "근무지별 합계 검토",
          description: "지급 요청 내역과 선지급 내역 테이블을 읽어 근무지별 편차를 확인합니다.",
          focusIndex: 1
        },
        {
          title: "개별 행 목록 확인",
          description: "행 목록에서 근무일, 근로유형, 총 수당, 비고를 다시 확인합니다.",
          focusIndex: 1
        }
      ],
      detailItems: [
        {
          title: "총 승인 금액 요약",
          description: "일반 지급과 선지급 금액을 분리해 이번 마감 묶음의 총 규모를 확인하는 카드입니다."
        },
        {
          title: "근무지별 합계 표",
          description: "근무지별 합계와 지급 구분을 비교해 편차가 큰 곳을 먼저 확인하는 표입니다."
        },
        {
          title: "개별 대상 목록",
          description: "근무일, 근로유형, 총 수당, 비고를 다시 검토하는 세부 행 목록입니다."
        }
      ],
      notes: ["미리보기 단계에서 이상이 보이면 닫고 상태를 다시 정리한 뒤 품의 승인을 다시 시작합니다."],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="proposal" />
      )
    },
    {
      id: "allowance-proposal-guide-finalize",
      kind: "feature",
      navLabel: "최종 승인·백업",
      title: "최종 품의 승인 버튼은 상태 확정과 자동 백업을 함께 실행합니다.",
      description:
        "승인 메모를 남긴 뒤 최종 버튼을 누르면 품의 승인 기록 저장, 관련 문서 기준 확정, 자동 백업 실행이 이어집니다.",
      goal: "마감 결과가 이력과 백업으로 재현 가능하게 남는지 확인합니다.",
      steps: [
        {
          title: "승인 메모 입력",
          description: "필요하면 이번 마감의 판단 근거를 메모로 남깁니다.",
          focusIndex: 2
        },
        {
          title: "최종 품의 승인 실행",
          description: "확인 대화상자 이후 상태가 `품의승인`으로 확정됩니다.",
          focusIndex: 2
        },
        {
          title: "백업과 기록 확인",
          description: "성공 메시지와 품의 승인 기록, 백업 결과가 남았는지 확인합니다.",
          focusIndex: 2
        }
      ],
      detailItems: [
        {
          title: "승인 메모 입력",
          description: "이번 마감 판단 근거를 텍스트로 남겨 이후 품의 이력 설명에 사용합니다."
        },
        {
          title: "최종 품의 승인 버튼",
          description: "상태를 `품의승인`으로 확정하고 관련 기록 저장을 시작하는 마지막 버튼입니다."
        },
        {
          title: "백업·기록 결과",
          description: "성공 메시지와 품의 승인 기록, 자동 백업 결과가 남았는지 확인하는 마감 확인 영역입니다."
        }
      ],
      preconditions: ["대상 수당이 이미 `승인` 상태로 정리되어 있어야 합니다."],
      outcome: "선택된 수당이 `품의승인` 상태로 바뀌고, 품의 승인 기록과 자동 백업 결과가 저장됩니다.",
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AllowanceGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="proposal" />
      )
    }
  ]
};

const scheduleGuide: RouteGuideDefinition = {
  routeKey: "schedule",
  title: "근무표 배포 가이드",
  description: "월간 근무표를 확인하고 양식을 선택해 지정된 경로로 배포하는 화면입니다.",
  pages: [
    {
      id: "schedule-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "근무표 배포는 월간 근무표를 검토하고 Excel 파일로 저장하는 화면입니다.",
      description:
        "대상 월과 근무지를 고정한 뒤 달력과 조별 배치를 확인하고, 양식을 선택해 지정된 경로에 배포합니다.",
      goal: "운영자는 배포 전 달력과 근무조 배치를 먼저 확인하고, 올바른 양식이 선택되었는지 검토한 뒤 배포 버튼을 누릅니다.",
      steps: [
        {
          title: "대상 월·근무지 고정",
          description: "배포 대상 연도, 월, 근무지를 먼저 선택해 달력이 올바른 범위를 보여주는지 확인합니다."
        },
        {
          title: "근무표 내용 검토",
          description: "달력과 근무조 배치가 정확한지 확인합니다. 오류가 있다면 배포 전에 수정해야 합니다."
        },
        {
          title: "양식 선택 후 배포",
          description: "활성화된 양식 중 이번 배포에 사용할 양식을 선택하고, 저장 경로를 확인한 뒤 배포 버튼을 누릅니다."
        }
      ],
      notes: [
        "양식이 비활성 상태이면 배포 화면에서 선택할 수 없습니다. 운영 관리 > 양식 탭에서 활성화합니다.",
        "배포 경로는 운영 관리 > 경로 설정에서 변경할 수 있습니다."
      ],
      preconditions: ["운영 관리 > 양식 탭에서 활성 양식이 최소 1개 이상 등록되어 있어야 합니다."],
      detailItems: [
        {
          title: "대상 월·근무지 컨트롤",
          description: "연도, 월, 근무지, 양식 선택이 한 카드에 모여 있어 배포 기준을 먼저 고정합니다."
        },
        {
          title: "달력과 조별 배치",
          description: "중앙 달력과 우측 조별 배치를 함께 읽어 실제 배포 전 근무표 내용이 맞는지 검토합니다."
        },
        {
          title: "최근 배포 상태",
          description: "하단 배포 이력과 경로 카드에서 마지막 배포 결과와 저장 위치를 다시 확인합니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <ScheduleGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="overview" />
      )
    },
    {
      id: "schedule-toc",
      kind: "toc",
      navLabel: "목차",
      title: "근무표 배포는 월·근무지 선택 → 양식 선택 → 배포 실행 → 이력 확인 순서로 봅니다.",
      description: "배포 범위를 먼저 확정하고 내용을 검토한 뒤 배포하면 이력이 자동으로 기록됩니다.",
      goal: "목차 페이지는 근무표 배포 메뉴에서 어떤 블록을 어떤 순서로 다뤄야 하는지 기준을 잡아 줍니다.",
      steps: [
        {
          title: "월·근무지 선택",
          description: "배포 대상 연도, 월, 근무지를 먼저 고정합니다."
        },
        {
          title: "양식 선택",
          description: "활성 양식 중 이번 배포에 사용할 양식을 선택합니다."
        },
        {
          title: "배포 실행",
          description: "저장 경로를 확인한 뒤 배포 버튼으로 Excel 파일을 생성합니다."
        },
        {
          title: "배포 이력",
          description: "완료된 배포 이력에서 결과를 재확인하거나 재배포 여부를 판단합니다."
        }
      ],
      detailItems: [
        {
          title: "월·근무지 선택 단계",
          description: "배포 대상 범위를 먼저 고정해 달력과 저장 결과의 기준을 맞추는 단계입니다."
        },
        {
          title: "양식 선택 단계",
          description: "활성 양식 중 실제 배포에 사용할 버전을 정하는 단계입니다."
        },
        {
          title: "배포 실행 단계",
          description: "저장 경로를 확인한 뒤 Excel 파일 생성을 실행하는 단계입니다."
        },
        {
          title: "배포 이력 확인 단계",
          description: "완료된 배포 결과와 파일 경로를 다시 읽어 재배포 여부를 판단하는 단계입니다."
        }
      ],
      notes: ["배포 이력은 접기/펼치기로 관리됩니다. 필요하면 이전 배포 결과를 다시 확인할 수 있습니다."],
      figure: <ScheduleGuideScene variant="toc" />
    },
    {
      id: "schedule-month-site",
      kind: "feature",
      navLabel: "월·근무지 선택",
      title: "배포 대상을 먼저 고정해야 달력과 배포 결과가 같은 기준으로 보입니다.",
      description:
        "연도, 월, 근무지 순서로 조건을 고정하면 달력이 정확한 근무표를 보여주고, 이후 양식 선택과 배포 결과도 같은 범위로 처리됩니다.",
      goal: "배포 범위를 먼저 확정해야 달력 내용과 배포 파일이 일치합니다.",
      steps: [
        {
          title: "연도 선택",
          description: "배포 대상 연도를 먼저 선택합니다."
        },
        {
          title: "월 선택",
          description: "배포할 근무표의 월을 선택합니다. 달력이 즉시 갱신됩니다."
        },
        {
          title: "근무지 선택",
          description: "배포 대상 근무지를 선택해 해당 근무지의 달력과 조별 배치를 확인합니다."
        }
      ],
      notes: ["필터를 바꾸면 달력과 근무조 배치가 즉시 갱신됩니다."],
      detailItems: [
        {
          title: "연도 선택",
          description: "배포할 연도를 먼저 고정해 달력 범위와 저장 파일 기준 연도를 맞춥니다."
        },
        {
          title: "월 선택",
          description: "선택한 월에 따라 달력과 근로시간 요약이 같은 기준으로 다시 그려집니다."
        },
        {
          title: "근무지 선택",
          description: "근무지를 바꾸면 조 편성, 제외 인원, 배포 이력까지 모두 같은 근무지 기준으로 바뀝니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <ScheduleGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="month-site" />
      )
    },
    {
      id: "schedule-distribute",
      kind: "feature",
      navLabel: "양식 선택·배포",
      title: "양식을 선택하고 경로를 확인한 뒤 배포 버튼을 누르면 Excel 파일이 생성됩니다.",
      description:
        "활성화된 양식 목록에서 이번 배포에 사용할 양식을 선택하고, 저장 경로가 올바른지 확인한 뒤 배포 버튼을 누릅니다.",
      goal: "배포 버튼을 누르기 전 양식과 경로를 마지막으로 확인합니다.",
      steps: [
        {
          title: "양식 선택",
          description: "활성 양식 중 이번 배포에 사용할 양식을 선택합니다."
        },
        {
          title: "저장 경로 확인",
          description: "표시된 저장 경로가 올바른 위치인지 확인합니다."
        },
        {
          title: "배포 실행",
          description: "배포 버튼을 누르면 Excel 파일이 생성되고 지정된 경로에 저장됩니다."
        }
      ],
      notes: [
        "배포가 완료되면 하단 이력에 결과가 자동으로 기록됩니다.",
        "같은 월·근무지 조건으로 다시 배포하면 이전 파일이 덮어써질 수 있습니다."
      ],
      preconditions: ["대상 월과 근무지가 먼저 선택되어 있어야 합니다."],
      outcome: "지정된 경로에 Excel 근무표 파일이 저장되고 배포 이력이 기록됩니다.",
      detailItems: [
        {
          title: "배포 양식 선택",
          description: "활성화된 양식 중 현재 배포에서 사용할 버전을 상단 컨트롤에서 선택합니다."
        },
        {
          title: "배포 실행 버튼",
          description: "배포 버튼은 현재 월, 근무지, 양식 조합으로 Excel 파일 생성과 저장을 시작합니다."
        },
        {
          title: "배포 경로와 최근 파일",
          description: "하단 상태 카드에서 실제 저장 경로와 직전 배포 파일명을 마지막으로 대조합니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <ScheduleGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="distribute" />
      )
    },
    {
      id: "schedule-history",
      kind: "feature",
      navLabel: "배포 이력",
      title: "배포 이력에서 완료된 배포 결과를 재확인하거나 재배포 여부를 판단합니다.",
      description:
        "배포 일시, 근무지, 대상 월, 양식, 처리자 정보로 이전 배포 이력을 다시 추적할 수 있습니다.",
      goal: "이력에서 배포 결과와 파일 경로를 확인해 재배포가 필요한지 판단합니다.",
      steps: [
        {
          title: "최근 배포 이력 확인",
          description: "배포 일시와 결과 상태를 먼저 확인합니다."
        },
        {
          title: "근무지·월 대조",
          description: "배포된 근무지와 대상 월이 현재 업무 기준과 맞는지 확인합니다."
        },
        {
          title: "재배포 판단",
          description: "근무표 내용이 변경되었다면 같은 조건으로 다시 배포합니다."
        }
      ],
      notes: ["배포 이력은 삭제되지 않으며, 재배포 시 새 이력이 추가됩니다."],
      detailItems: [
        {
          title: "배포 상태 요약",
          description: "상단 상태 카드에서 현재 상태와 최근 배포 파일을 먼저 확인합니다."
        },
        {
          title: "최근 배포 행",
          description: "첫 번째 이력 행에서 배포 일시, 근무지, 양식, 결과를 읽어 현재 기준과 비교합니다."
        },
        {
          title: "저장 경로",
          description: "실제 파일 저장 경로를 확인해 재배포 또는 파일 회수가 가능한지 판단합니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <ScheduleGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="history" />
      )
    }
  ]
};

const operationsGuide: RouteGuideDefinition = {
  routeKey: "operations",
  title: "운영 관리 가이드",
  description: "경로 설정, 공휴일, 요율, 사용자, 양식 관리와 상단 DB업데이트 흐름을 다루는 관리자 전용 화면입니다.",
  pages: [
    {
      id: "operations-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "운영 관리는 수당 산출과 배포에 영향을 주는 기준 데이터를 관리하는 관리자 전용 메뉴입니다.",
      description:
        "경로 설정, 공휴일 관리, 요율 관리, 사용자 관리, 양식 관리 탭으로 구성되고, 상단에서 DB업데이트를 바로 실행할 수 있습니다.",
      goal: "운영자는 이 메뉴에서 시스템 전체의 운영 기준을 설정하고 유지합니다. 설정 변경은 전체 수당 산출과 배포에 즉시 영향을 줍니다.",
      steps: [
        {
          title: "경로와 백업 기준 고정",
          description: "승인 폴더, 문서 저장, DB 백업 경로를 먼저 맞춰 전체 운영 기준을 안정화합니다."
        },
        {
          title: "운영 기준 관리",
          description: "공휴일, 요율, 사용자 계정, 양식을 탭별로 나눠 관리합니다."
        },
        {
          title: "DB업데이트 실행",
          description: "상단 버튼에서 미리보기를 연 뒤 백업과 업데이트 결과를 함께 확인합니다."
        }
      ],
      notes: [
        "이 메뉴는 관리자 계정으로만 접근할 수 있습니다.",
        "요율 변경은 이후 새로 산출되는 수당에만 적용됩니다. 이미 승인된 수당은 영향을 받지 않습니다."
      ],
      detailItems: [
        {
          title: "운영 탭 구조",
          description: "상단 탭에서 경로, 공휴일, 요율, 사용자, 양식 관리 흐름을 구분해 이동합니다."
        },
        {
          title: "DB업데이트 진입",
          description: "우측 상단 버튼은 미리보기 모달을 열어 백업과 업데이트 흐름을 시작하는 관리자 액션입니다."
        },
        {
          title: "현재 탭 작업 영역",
          description: "선택한 탭의 실제 설정 카드와 현황 블록이 이 영역에 표시됩니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="overview"
        />
      )
    },
    {
      id: "operations-toc",
      kind: "toc",
      navLabel: "목차",
      title: "운영 관리는 탭별로 구성되어 있습니다. 필요한 탭을 선택해 기준 데이터를 설정합니다.",
      description: "다섯 개 탭과 상단 DB업데이트 버튼이 역할을 나눠 담당하므로, 필요한 구간만 선택해 작업합니다.",
      goal: "목차 페이지는 운영 관리 메뉴의 탭 구성과 각 탭의 역할을 빠르게 파악하도록 돕습니다.",
      steps: [
        {
          title: "경로 설정",
          description: "승인 폴더, 저장 경로, 백업 경로를 먼저 확인합니다."
        },
        {
          title: "공휴일·요율",
          description: "수당 자동 산출의 기준이 되는 공휴일과 요율 버전을 관리합니다."
        },
        {
          title: "사용자 관리",
          description: "계정 생성, 권한 변경, 비밀번호 초기화를 처리합니다."
        },
        {
          title: "양식 관리",
          description: "배포와 문서 출력에 사용할 양식을 등록하고 승인 및 기본 사용 규칙을 관리합니다."
        },
        {
          title: "DB업데이트",
          description: "상단 버튼에서 미리보기와 업데이트 실행을 시작합니다."
        }
      ],
      detailItems: [
        {
          title: "경로 설정 탭",
          description: "승인 폴더와 문서 저장, 백업 경로를 관리해 전체 운영 흐름의 기반을 만드는 탭입니다."
        },
        {
          title: "공휴일·요율 탭",
          description: "수당 자동 산출의 기준이 되는 날짜와 배율 정책을 유지하는 탭입니다."
        },
        {
          title: "사용자 관리 탭",
          description: "로그인 계정과 권한, 비밀번호 초기화를 관리하는 보안 탭입니다."
        },
        {
          title: "양식 관리 탭",
          description: "배포와 출력에 쓸 양식을 등록, 승인, 기본 사용 기준으로 유지하는 탭입니다."
        },
        {
          title: "DB업데이트 진입",
          description: "상단 버튼으로 미리보기와 백업 확인을 거쳐 실제 업데이트를 실행하는 별도 흐름입니다."
        }
      ],
      notes: ["각 탭은 독립적으로 동작하므로 필요한 탭만 선택해 작업합니다."],
      figure: <OperationsGuideScene variant="toc" />
    },
    {
      id: "operations-settings",
      kind: "feature",
      navLabel: "경로 설정",
      title: "경로 설정은 운영 흐름의 기준점입니다. 승인 폴더와 저장 경로를 먼저 맞춰야 이후 작업이 흔들리지 않습니다.",
      description:
        "승인 대기 폴더, 승인 완료 폴더, 근무표 저장, 품의서 저장, DB 백업 경로를 한 화면에서 함께 관리합니다.",
      goal: "경로 설정이 어긋나면 배포, 문서 출력, DB업데이트 결과 모두 잘못된 위치로 기록될 수 있으므로 먼저 점검합니다.",
      steps: [
        {
          title: "승인 폴더 확인",
          description: "승인 대기와 승인 완료 폴더가 실제 운영 폴더를 가리키는지 확인합니다."
        },
        {
          title: "문서 저장 경로 확인",
          description: "근무표와 품의서, 별첨 출력 경로가 운영 표준에 맞는지 확인합니다."
        },
        {
          title: "DB 백업 경로 확인",
          description: "백업 경로가 정상 드라이브를 가리키는지 먼저 확인한 뒤 저장합니다."
        }
      ],
      notes: ["경로를 저장한 뒤에는 해당 경로 기준으로 이후 배포와 출력이 기록됩니다."],
      detailItems: [
        {
          title: "승인 폴더 묶음",
          description: "승인 대기와 승인 완료 폴더가 실제 운영 경로를 가리키는지 먼저 확인합니다."
        },
        {
          title: "문서·백업 경로 묶음",
          description: "근무표, 품의서, 백업 경로가 같은 운영 드라이브 기준으로 정리됐는지 검토합니다."
        },
        {
          title: "저장 버튼",
          description: "저장 버튼을 눌러야 이후 배포와 문서 출력, 백업이 새 경로를 사용합니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="settings"
        />
      )
    },
    {
      id: "operations-holiday-rate",
      kind: "feature",
      navLabel: "공휴일·요율",
      title: "공휴일을 먼저 등록하고, 수당 배율이 운영 정책과 맞는지 함께 확인합니다.",
      description:
        "공휴일 탭에서 연간 법정 및 임시 공휴일을 등록하고, 요율 탭에서 근로유형별 수당 배율을 설정합니다.",
      goal: "공휴일과 요율은 수당 자동 산출의 기준이 됩니다. 변경 전에 영향 범위를 반드시 확인합니다.",
      steps: [
        {
          title: "공휴일 탭에서 등록",
          description: "날짜와 공휴일명을 입력하고 법정 또는 임시 구분을 선택합니다."
        },
        {
          title: "요율 탭에서 배율 확인",
          description: "연장, 대체, 휴일 근로유형별 배율이 현재 운영 정책과 일치하는지 확인합니다."
        },
        {
          title: "변경 저장",
          description: "수정한 내용을 저장하면 이후 새로 산출되는 수당에 반영됩니다."
        }
      ],
      notes: [
        "요율 변경은 기존에 이미 산출된 수당에는 영향을 주지 않습니다.",
        "공휴일 변경은 변경 후 새로 실행하는 수당 산출부터 적용됩니다."
      ],
      detailItems: [
        {
          title: "공휴일 관리 패널",
          description: "법정·임시 공휴일 목록과 API 반영 상태를 먼저 확인합니다."
        },
        {
          title: "요율 관리 패널",
          description: "현재 적용 중인 배율과 비교 버전을 읽어 정책 변경 여부를 검토합니다."
        },
        {
          title: "요율 적용 버튼",
          description: "검토가 끝난 뒤 요율 적용 버튼으로 이후 산출 기준을 갱신합니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="holiday-rate"
        />
      )
    },
    {
      id: "operations-user",
      kind: "feature",
      navLabel: "사용자 관리",
      title: "사용자 계정을 생성하고 권한을 설정합니다.",
      description:
        "사용자 탭에서 로그인 계정을 추가하고 관리자 또는 일반 사용자 권한을 부여합니다. 비밀번호 초기화도 이 탭에서 처리합니다.",
      goal: "권한 설정은 메뉴 접근 범위를 결정합니다. 관리자 권한은 운영 관리와 활동 이력 접근을 포함합니다.",
      steps: [
        {
          title: "신규 계정 등록",
          description: "로그인 ID, 이름, 초기 비밀번호, 권한을 설정해 계정을 생성합니다."
        },
        {
          title: "권한 변경",
          description: "기존 계정의 권한을 관리자 또는 일반 사용자로 변경합니다."
        },
        {
          title: "비밀번호 초기화",
          description: "비밀번호를 분실한 계정은 비밀번호 초기화 버튼으로 임시 비밀번호로 재설정합니다."
        }
      ],
      notes: [
        "비활성 계정은 로그인이 불가능합니다.",
        "관리자 권한을 가진 계정이 최소 1개 이상 유지되어야 합니다."
      ],
      detailItems: [
        {
          title: "신규 사용자 추가",
          description: "새 로그인 계정, 권한, 초기 상태를 등록하는 시작 버튼입니다."
        },
        {
          title: "사용자 목록",
          description: "계정별 권한과 상태를 표에서 한 번에 읽고 관리 대상을 고릅니다."
        },
        {
          title: "행 단위 관리",
          description: "첫 행의 수정 버튼처럼 계정별 상세 관리 액션을 실행하는 영역입니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="user"
        />
      )
    },
    {
      id: "operations-template",
      kind: "feature",
      navLabel: "양식 관리",
      title: "배포와 문서 출력에 사용할 양식을 등록하고 승인 및 기본 사용 상태를 관리합니다.",
      description:
        "양식 탭에서 Excel 템플릿 파일을 등록하고 승인 상태와 기본 사용 규칙을 설정합니다. 승인된 양식만 배포와 문서 출력 메뉴에서 선택됩니다.",
      goal: "배포와 문서 출력에서 선택 가능한 양식은 승인 상태여야 하며, 기본 사용 규칙도 이 화면에서 관리됩니다.",
      steps: [
        {
          title: "양식 파일 등록",
          description: "Excel 템플릿 파일을 업로드하고 양식명을 입력합니다."
        },
        {
          title: "양식 승인",
          description: "검증이 끝난 양식을 승인해 실제 배포와 문서 출력 메뉴에서 선택 가능하게 만듭니다."
        },
        {
          title: "기본 양식 지정",
          description: "자주 사용하는 양식을 기본 사용으로 지정하면 관련 메뉴에서 우선 선택됩니다."
        }
      ],
      notes: [
        "승인되지 않은 양식은 배포 화면과 문서 출력 화면에서 선택할 수 없습니다.",
        "기본 양식은 1개만 지정할 수 있습니다."
      ],
      detailItems: [
        {
          title: "양식 등록 버튼",
          description: "새 Excel 양식을 목록에 올리기 위한 등록 진입 버튼입니다."
        },
        {
          title: "승인 상태 영역",
          description: "양식별 승인 여부를 읽고 실제 사용 후보로 올릴 버전을 판단합니다."
        },
        {
          title: "기본 사용 전환",
          description: "승인된 버전 중 자동 선택 기준이 될 양식을 지정하는 영역입니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="template"
        />
      )
    },
    {
      id: "operations-db-update",
      kind: "feature",
      navLabel: "DB업데이트",
      title: "DB업데이트는 미리보기에서 원본 유형, 현황 비교, 경고를 확인한 뒤 실행합니다.",
      description:
        "상단 DB업데이트 버튼으로 미리보기를 열고, 원본 파일 유형과 백업 조건, 현황 비교, 경고 및 제외 항목을 확인한 뒤 실제 업데이트를 실행합니다.",
      goal: "실제 DB 교체 전에 입력 파일 기준과 비교 결과, 경고를 모두 읽고 실행 여부를 판단합니다.",
      steps: [
        {
          title: "DB업데이트 진입",
          description: "상단 DB업데이트 버튼으로 미리보기 모달을 엽니다.",
          focusIndex: 0
        },
        {
          title: "미리보기 전체 확인",
          description: "입력 파일 유형, 현황 비교, 경고 및 제외 항목을 한 묶음으로 먼저 읽습니다.",
          focusIndex: 7
        },
        {
          title: "실행 버튼과 결과 확인",
          description: "확인이 끝나면 실행 버튼으로 업데이트를 진행하고, 완료 결과를 다시 확인합니다.",
          focusIndex: 4
        }
      ],
      notes: [
        "업데이트 중 앱을 종료하면 데이터가 손상될 수 있습니다.",
        "정기적으로 실행해 데이터를 최신 상태로 유지합니다."
      ],
      preconditions: ["백업 경로가 유효한 드라이브 경로를 가리키고 있어야 합니다."],
      outcome: "DB가 업데이트되고 마지막 업데이트 시각이 갱신됩니다. 백업 파일이 지정된 경로에 저장됩니다.",
      detailItems: [
        {
          title: "DB업데이트 진입 버튼",
          description: "상단 버튼으로 미리보기 모달을 열어 업데이트 흐름을 시작합니다."
        },
        {
          title: "미리보기 검토 블록",
          description: "입력 파일 유형, 현황 비교, 경고 및 제외 항목을 실행 전에 다시 읽는 검토 영역입니다.",
          focusIndex: 7
        },
        {
          title: "업데이트 실행과 결과",
          description: "실행 버튼으로 DB 교체를 시작하고, 완료 뒤 결과 요약과 후속 확인 정보를 다시 읽습니다.",
          focusIndex: 4
        }
      ],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="db-update"
        />
      )
    }
  ]
};

export const operationsTemplateManagementGuide: RouteGuideDefinition = {
  routeKey: "operations",
  title: "양식 관리 가이드",
  description: "양식 등록, 승인, 기본 사용 전환을 실무 순서대로 설명하는 세부 가이드입니다.",
  pages: [
    {
      id: "operations-template-guide-intro",
      kind: "intro",
      navLabel: "가이드 소개",
      title: "양식 관리는 등록, 승인, 기본 사용 전환을 통해 배포와 문서 출력 기준을 유지하는 기능입니다.",
      description:
        "근무표 양식, 품의서 양식, 별첨 양식을 한 화면에서 관리하고, 승인된 버전만 실제 배포와 출력에 노출합니다.",
      goal: "양식 등록과 운영 전환이 어떻게 이어지는지 실무 흐름 기준으로 이해합니다.",
      steps: [
        {
          title: "새 양식 등록",
          description: "파일을 가져와 1차 검증 후 저장 후보를 만듭니다.",
          focusIndex: 0
        },
        {
          title: "양식 승인",
          description: "검증이 끝난 버전을 승인해 실제 사용 후보로 올립니다.",
          focusIndex: 1
        },
        {
          title: "기본 사용 전환",
          description: "여러 승인본 중 현재 기본 사용 기준을 지정합니다.",
          focusIndex: 2
        }
      ],
      detailItems: [
        {
          title: "양식 등록 시작점",
          description: "원본 파일과 표시 이름을 등록해 새 버전을 운영 목록에 올리는 시작 단계입니다."
        },
        {
          title: "양식 승인 단계",
          description: "검증이 끝난 버전을 실제 배포·출력 후보로 올리는 운영 전환 단계입니다."
        },
        {
          title: "기본 사용 전환 단계",
          description: "여러 승인본 중 현재 자동 선택 기준이 될 버전을 정하는 마감 단계입니다."
        }
      ],
      notes: ["승인되지 않은 양식은 배포나 문서 출력 메뉴에서 선택되지 않습니다."],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="template"
        />
      )
    },
    {
      id: "operations-template-guide-toc",
      kind: "toc",
      navLabel: "목차",
      title: "양식 관리는 등록, 승인, 기본 사용, 변경 이력 확인 순서로 보면 됩니다.",
      description: "목차 페이지는 어떤 버튼이 어떤 의미를 가지는지 빠르게 파악하도록 돕습니다.",
      goal: "등록과 운영 전환 단계를 명확히 구분합니다.",
      steps: [
        {
          title: "양식 등록",
          description: "파일과 문서 종류, 버전명을 먼저 정합니다."
        },
        {
          title: "승인",
          description: "검증을 통과한 버전을 실제 사용 후보로 올립니다."
        },
        {
          title: "기본 사용",
          description: "승인본 중 자동 선택 기준이 될 버전을 정합니다."
        },
        {
          title: "변경 이력 확인",
          description: "최근 변경 이력에서 누가 무엇을 바꿨는지 다시 확인합니다."
        }
      ],
      detailItems: [
        {
          title: "양식 등록 단계",
          description: "파일과 문서 종류, 버전명을 정해 새 버전 후보를 만드는 단계입니다."
        },
        {
          title: "승인 단계",
          description: "검증을 통과한 버전을 실제 사용 후보로 전환하는 운영 단계입니다."
        },
        {
          title: "기본 사용 단계",
          description: "승인본 중 현재 자동 선택 기준이 될 버전을 정하는 기준 단계입니다."
        },
        {
          title: "변경 이력 확인 단계",
          description: "누가 어떤 버전을 등록하고 승인·전환했는지 다시 읽는 추적 단계입니다."
        }
      ],
      notes: ["같은 양식 종류라도 여러 버전을 병행 보관할 수 있습니다."],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="template"
        />
      )
    },
    {
      id: "operations-template-guide-register",
      kind: "feature",
      navLabel: "양식 등록",
      title: "양식 등록은 파일 준비와 1차 검증, 2단계 위치 조정 순서로 처리합니다.",
      description:
        "양식등록 버튼으로 모달을 열고 문서 종류, 표시 이름, 보관 파일명을 정한 뒤 1차 검증과 2단계 조정을 진행합니다.",
      goal: "잘못된 파일 구조를 운영 목록에 올리지 않고 검증된 후보만 저장합니다.",
      steps: [
        {
          title: "문서 종류와 이름 입력",
          description: "어느 메뉴에서 쓸 양식인지와 목록 표시 이름을 먼저 정합니다.",
          focusIndex: 0
        },
        {
          title: "파일 가져오기와 1차 검증",
          description: "원본 Excel 파일을 선택하고 시트/후보 셀 구조를 먼저 검증합니다.",
          focusIndex: 0
        },
        {
          title: "2단계 위치 조정 후 저장",
          description: "필요한 셀 위치를 보정하고 저장해 미승인 버전으로 등록합니다.",
          focusIndex: 0
        }
      ],
      detailItems: [
        {
          title: "문서 종류·이름 입력",
          description: "양식이 어느 메뉴에서 쓰이는지와 목록 표시 이름을 정하는 기본 정보 영역입니다."
        },
        {
          title: "파일 가져오기·1차 검증",
          description: "원본 Excel 파일을 읽고 시트와 후보 셀 구조를 먼저 검토하는 준비 단계입니다."
        },
        {
          title: "2단계 위치 조정·저장",
          description: "필요한 셀 위치를 보정하고 미승인 버전으로 등록하는 마지막 저장 단계입니다."
        }
      ],
      notes: ["등록 직후에는 미승인 상태이므로 바로 배포나 출력에 사용되지 않습니다."],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="template"
        />
      )
    },
    {
      id: "operations-template-guide-approve",
      kind: "feature",
      navLabel: "승인",
      title: "양식 승인은 검증된 버전을 실제 사용 후보로 전환하는 단계입니다.",
      description:
        "양식 목록의 승인 버튼은 해당 버전을 배포와 문서 출력에서 선택 가능한 상태로 올립니다.",
      goal: "운영 기준에 맞는 버전만 실제 선택 목록에 노출되게 합니다.",
      steps: [
        {
          title: "대상 버전 확인",
          description: "버전명, 문서 종류, 현재 상태를 먼저 확인합니다.",
          focusIndex: 1
        },
        {
          title: "승인 실행",
          description: "승인 버튼으로 상태를 `승인`으로 변경합니다.",
          focusIndex: 1
        },
        {
          title: "선택 가능 여부 확인",
          description: "승인 후에는 배포/출력 메뉴에서 해당 양식을 선택할 수 있습니다.",
          focusIndex: 1
        }
      ],
      detailItems: [
        {
          title: "대상 버전 정보",
          description: "버전명과 문서 종류, 현재 상태를 읽어 승인 대상이 맞는지 확인하는 영역입니다."
        },
        {
          title: "승인 버튼",
          description: "해당 버전을 실제 배포·출력 후보로 전환하는 핵심 실행 버튼입니다."
        },
        {
          title: "선택 가능 상태",
          description: "승인 이후 관련 메뉴에서 이 버전이 선택 목록에 노출되는 운영 상태를 의미합니다."
        }
      ],
      notes: ["승인은 사용 후보 등록이고, 자동 선택 기준 전환은 `기본 사용`에서 따로 처리합니다."],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="template"
        />
      )
    },
    {
      id: "operations-template-guide-default",
      kind: "feature",
      navLabel: "기본 사용",
      title: "기본 사용 전환은 승인된 버전 중 자동 선택 기준을 정하는 마지막 단계입니다.",
      description:
        "기본 사용 버튼은 승인된 양식 중 현재 운영 기준이 될 버전을 지정하며, 관련 메뉴에서 우선 선택 기준으로 사용됩니다.",
      goal: "여러 승인본이 있어도 현재 운영 기준이 어떤 버전인지 명확히 유지합니다.",
      steps: [
        {
          title: "승인 상태 확인",
          description: "기본 사용 전환 전 해당 양식이 이미 승인 상태인지 확인합니다.",
          focusIndex: 2
        },
        {
          title: "기본 사용 실행",
          description: "기본 사용 버튼으로 자동 선택 기준을 전환합니다.",
          focusIndex: 2
        },
        {
          title: "변경 이력 확인",
          description: "최근 양식 변경 이력에서 기본 사용 전환 기록을 다시 확인합니다.",
          focusIndex: 2
        }
      ],
      detailItems: [
        {
          title: "승인 상태 확인",
          description: "기본 사용으로 전환할 수 있는 버전인지 먼저 판별하는 기준 영역입니다."
        },
        {
          title: "기본 사용 버튼",
          description: "현재 자동 선택 기준이 될 버전을 지정하는 실행 버튼입니다."
        },
        {
          title: "변경 이력 확인",
          description: "기본 사용 전환 기록이 정상적으로 남았는지 다시 검토하는 추적 단계입니다."
        }
      ],
      preconditions: ["대상 양식 버전이 이미 `승인` 상태여야 합니다."],
      outcome: "선택된 버전이 해당 양식 종류의 기본 사용 기준으로 전환되고, 변경 이력에 기록됩니다.",
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="template"
        />
      )
    }
  ]
};

export const operationsDatabaseUpdateGuide: RouteGuideDefinition = {
  routeKey: "operations",
  title: "DB업데이트 가이드",
  description: "마이그레이션 파일 미리보기와 실제 업데이트 실행을 설명하는 세부 가이드입니다.",
  pages: [
    {
      id: "operations-db-update-guide-intro",
      kind: "intro",
      navLabel: "가이드 소개",
      title: "DB업데이트는 원본 파일을 읽어 현재 DB를 교체하기 전에 미리보기와 백업 기준을 먼저 확인하는 기능입니다.",
      description:
        "상단 DB업데이트 버튼으로 미리보기 모달을 열고, 예상 변화량과 경고를 확인한 뒤 실제 업데이트를 실행합니다.",
      goal: "업데이트 전에 어떤 데이터가 바뀌는지와 백업 조건을 먼저 확인하는 절차를 고정합니다.",
      steps: [
        {
          title: "마이그레이션 파일 지정",
          description: "운영 관리 경로 설정에서 마이그레이션 파일 경로를 먼저 저장합니다.",
          focusIndex: 0
        },
        {
          title: "미리보기 확인",
          description: "입력 파일 유형과 현황 비교, 경고 및 제외 항목을 순서대로 읽습니다.",
          focusIndex: 7
        },
        {
          title: "실제 업데이트 실행",
          description: "승인 버튼으로 DB 교체와 백업 기록을 함께 실행합니다.",
          focusIndex: 4
        }
      ],
      detailItems: [
        {
          title: "원본 파일·경로 기준",
          description: "마이그레이션 파일과 백업 경로가 먼저 맞아야 안전한 업데이트가 가능합니다.",
          focusIndex: 0
        },
        {
          title: "미리보기 비교 블록",
          description: "예상 변화량과 경고를 읽어 실제 실행 전 영향을 판단하는 검토 영역입니다.",
          focusIndex: 7
        },
        {
          title: "실제 업데이트 실행",
          description: "승인 버튼으로 DB 교체와 백업 기록을 함께 시작하는 최종 실행 영역입니다.",
          focusIndex: 4
        }
      ],
      notes: ["미리보기 없이 바로 업데이트가 진행되지 않도록 모달이 먼저 열립니다."],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="db-update"
        />
      )
    },
    {
      id: "operations-db-update-guide-toc",
      kind: "toc",
      navLabel: "목차",
      title: "DB업데이트는 파일 확인, 미리보기 검토, 승인 실행, 결과 확인 순서로 봅니다.",
      description: "목차 페이지는 업데이트 전에 어떤 정보를 어떤 순서로 읽어야 하는지 정리합니다.",
      goal: "데이터 교체 작업을 단계적으로 확인해 운영 리스크를 낮춥니다.",
      steps: [
        {
          title: "파일과 경로 확인",
          description: "마이그레이션 파일과 백업 경로를 먼저 확인합니다."
        },
        {
          title: "현황 비교 검토",
          description: "현재 값과 업데이트 예정 값을 비교합니다."
        },
        {
          title: "경고 및 제외 항목 검토",
          description: "자동 복원 제외 대상과 경고 메시지를 읽습니다."
        },
        {
          title: "승인 실행과 결과 확인",
          description: "승인 버튼으로 실행하고 완료 메시지를 확인합니다."
        }
      ],
      detailItems: [
        {
          title: "파일·경로 확인 단계",
          description: "원본 파일과 백업 경로가 모두 유효한지 먼저 확인하는 시작 단계입니다."
        },
        {
          title: "현황 비교 단계",
          description: "현재 DB 상태와 업데이트 예정 값을 비교해 영향 범위를 파악하는 단계입니다."
        },
        {
          title: "경고 검토 단계",
          description: "자동 복원 제외 대상과 경고 메시지를 읽어 위험 구간을 확인하는 단계입니다."
        },
        {
          title: "승인 실행·결과 확인 단계",
          description: "최종 승인 후 완료 메시지와 반영 결과를 확인하는 마감 단계입니다."
        }
      ],
      notes: ["업데이트 중에는 다른 작업을 같이 진행하지 않는 것이 안전합니다."],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="db-update"
        />
      )
    },
    {
      id: "operations-db-update-guide-preview",
      kind: "feature",
      navLabel: "미리보기 검토",
      title: "미리보기에서는 현황 비교와 이관 상세, 경고를 먼저 확인합니다.",
      description:
        "현재 DB 상태와 업데이트 예정 상태를 표로 비교하고, 항목별 이관 건수와 경고 메시지를 함께 읽습니다.",
      goal: "실행 전에 예상 변화량과 제외 항목을 정확히 이해합니다.",
      steps: [
        {
          title: "마이그레이션 유형 확인",
          description: "JSON 복원인지 Access 원본 이관인지 먼저 확인합니다.",
          focusIndex: 1
        },
        {
          title: "현황 비교 읽기",
          description: "현재 값과 업데이트 예정 값을 비교해 영향 범위를 파악합니다.",
          focusIndex: 2
        },
        {
          title: "경고 및 제외 항목 확인",
          description: "자동 이관에서 제외되는 항목이 있는지 확인합니다.",
          focusIndex: 3
        }
      ],
      detailItems: [
        {
          title: "마이그레이션 유형",
          description: "JSON 복원인지 Access 원본 이관인지 먼저 확인해 해석 기준을 맞춥니다.",
          focusIndex: 1
        },
        {
          title: "현황 비교 표",
          description: "현재 값과 업데이트 예정 값을 나란히 읽어 영향 범위를 판단하는 핵심 표입니다.",
          focusIndex: 2
        },
        {
          title: "경고·제외 항목",
          description: "자동 이관 제외 대상과 경고를 읽어 원본 파일 재점검 필요 여부를 판단합니다.",
          focusIndex: 3
        }
      ],
      notes: ["경고가 많으면 즉시 실행하지 말고 원본 파일과 경로 설정을 다시 점검하는 편이 좋습니다."],
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="db-update"
        />
      )
    },
    {
      id: "operations-db-update-guide-run",
      kind: "feature",
      navLabel: "승인 실행",
      title: "승인 버튼은 실제 DB 교체와 결과 기록을 실행합니다.",
      description:
        "미리보기 검토를 마친 뒤 승인 버튼을 누르면 현재 설정을 저장하고, DB 업데이트와 완료 결과 기록을 진행합니다.",
      goal: "업데이트가 완료된 뒤 결과 메시지와 마지막 상태가 남는지 확인합니다.",
      steps: [
        {
          title: "승인 버튼 실행",
          description: "미리보기 결과를 확인한 뒤 승인 버튼을 눌러 업데이트를 시작합니다.",
          focusIndex: 4
        },
        {
          title: "완료 메시지 확인",
          description: "완료 후 성공 메시지와 실제 반영 결과 수치를 확인합니다.",
          focusIndex: 5
        },
        {
          title: "운영 기준 재확인",
          description: "백업 파일명과 후속 확인 항목을 읽고, 필요하면 경로 설정 탭으로 돌아가 기준을 다시 확인합니다.",
          focusIndex: 6
        }
      ],
      detailItems: [
        {
          title: "승인 버튼",
          description: "미리보기 검토를 마친 뒤 실제 DB 교체와 기록 저장을 시작하는 마지막 버튼입니다.",
          focusIndex: 4
        },
        {
          title: "완료 메시지",
          description: "업데이트 성공 여부와 반영 결과 수치를 즉시 확인하는 피드백 영역입니다.",
          focusIndex: 5
        },
        {
          title: "운영 기준 재확인",
          description: "백업 파일명과 후속 확인 항목을 다시 읽고, 필요 시 경로 설정을 재검토하는 후속 확인 단계입니다.",
          focusIndex: 6
        }
      ],
      preconditions: ["마이그레이션 파일 경로와 DB 백업 경로가 먼저 올바르게 설정되어 있어야 합니다."],
      outcome: "DB가 새 데이터로 교체되고, 완료 메시지와 반영 결과가 모달에 남습니다.",
      renderFigure: ({ activeFocusIndex, activeStepNumber, activeTab }) => (
        <OperationsGuideScene
          activeFocusIndex={activeFocusIndex}
          activeStepNumber={activeStepNumber}
          activeTab={activeTab}
          variant="db-update"
        />
      )
    }
  ]
};

const accessHistoryGuide: RouteGuideDefinition = {
  routeKey: "access-history",
  title: "활동 이력 가이드",
  description: "로그인, 화면 이동, 주요 업무 처리 기록을 조회하는 관리자 전용 감사 화면입니다.",
  pages: [
    {
      id: "access-history-intro",
      kind: "intro",
      navLabel: "메뉴 소개",
      title: "활동 이력은 시스템 전체의 사용자 행동을 추적하는 감사용 조회 화면입니다.",
      description:
        "로그인 성공/실패, 화면 이동, 승인 처리, 문서 출력 등 주요 액션이 모두 시간 순서로 기록됩니다.",
      goal: "관리자는 이 화면에서 이상 행동을 탐지하거나, 특정 업무 처리의 근거를 사후에 추적합니다.",
      steps: [
        {
          title: "기간과 대상 필터 설정",
          description: "조회 기간을 먼저 설정하고 사용자와 액션 유형을 추가로 좁혀 필요한 이력만 봅니다."
        },
        {
          title: "이력 테이블 해석",
          description: "처리시각, 사용자, 액션 유형, 대상 화면, 세부 내용으로 업무 흐름을 추적합니다."
        },
        {
          title: "이상 행동 식별",
          description: "로그인 실패 반복, 비정상 시간대 고위험 액션 등 이상 행동을 먼저 확인합니다."
        }
      ],
      notes: [
        "이 메뉴는 관리자 계정으로만 접근할 수 있습니다.",
        "이력은 삭제되지 않으며 읽기 전용으로만 조회됩니다."
      ],
      detailItems: [
        {
          title: "조회 필터 영역",
          description: "기간, 사용자, 액션, 검색 조건을 먼저 정해 필요한 활동 범위를 고정합니다."
        },
        {
          title: "활동 요약 배지",
          description: "승인, 출력, 로그인 실패 같은 주요 액션 건수를 먼저 읽어 위험 징후를 찾습니다."
        },
        {
          title: "활동 이력 테이블",
          description: "실제 처리시각과 사용자, 액션, 상세 내용을 읽어 구체적인 행위를 추적합니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AccessHistoryGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="overview" />
      )
    },
    {
      id: "access-history-toc",
      kind: "toc",
      navLabel: "목차",
      title: "활동 이력은 날짜, 사용자, 액션 필터를 순서대로 좁히고 이력 해석으로 이어집니다.",
      description: "필터를 정리한 뒤 테이블 이력을 읽는 흐름으로 사용합니다.",
      goal: "목차 페이지는 활동 이력 메뉴에서 어떤 블록을 어떤 순서로 다뤄야 하는지 기준을 잡아 줍니다.",
      steps: [
        {
          title: "날짜 필터",
          description: "조회 기간을 먼저 설정합니다."
        },
        {
          title: "사용자 필터",
          description: "특정 계정의 활동을 추적할 때 사용자 필터를 추가합니다."
        },
        {
          title: "액션 필터",
          description: "로그인, 화면이동, 승인, 출력 등 액션 유형으로 이력을 분류합니다."
        },
        {
          title: "이력 해석",
          description: "처리시각, 계정, 액션, 대상 화면, 세부 내용으로 이상 행동을 판단합니다."
        }
      ],
      detailItems: [
        {
          title: "날짜 필터 단계",
          description: "조회 기간을 먼저 고정해 이력 범위의 시작과 끝을 정하는 단계입니다."
        },
        {
          title: "사용자 필터 단계",
          description: "특정 계정 활동만 추적할지 전체를 볼지 결정하는 단계입니다."
        },
        {
          title: "액션 필터 단계",
          description: "로그인, 이동, 승인, 출력 등 필요한 액션만 남기는 분류 단계입니다."
        },
        {
          title: "이력 해석 단계",
          description: "처리시각과 계정, 액션, 세부 내용을 함께 읽어 이상 행동을 판단하는 단계입니다."
        }
      ],
      notes: ["필터를 좁히지 않으면 이력 건수가 많아 이상 행동을 찾기 어렵습니다. 기간 필터를 먼저 설정하는 것이 좋습니다."],
      figure: <AccessHistoryGuideScene variant="toc" />
    },
    {
      id: "access-history-filters",
      kind: "feature",
      navLabel: "필터 조합",
      title: "날짜 → 사용자 → 액션 유형 순서로 좁혀야 원하는 이력만 정확하게 조회됩니다.",
      description:
        "활동 이력 상단 필터는 조회 기간, 사용자, 액션 유형을 조합해 필요한 이력 범위를 좁힙니다.",
      goal: "필터를 순서대로 좁히면 관련 없는 이력이 제거되어 이상 행동을 더 빠르게 찾을 수 있습니다.",
      steps: [
        {
          title: "시작일 설정",
          description: "조회 시작일을 먼저 정해 확인할 범위의 첫 날짜를 고정합니다."
        },
        {
          title: "종료일 설정",
          description: "종료일을 함께 맞춰 필요한 기간만 남기고 과거 이력을 줄입니다."
        },
        {
          title: "사용자 선택",
          description: "특정 계정을 추적할 때는 사용자 필터를 추가합니다. 전체를 두면 모든 계정의 이력이 표시됩니다."
        },
        {
          title: "액션 유형 선택",
          description: "로그인, 화면이동, 승인, 출력 중 필요한 액션 유형만 남겨 범위를 최종 확정합니다."
        },
        {
          title: "조회 실행",
          description: "마지막으로 조회 버튼을 눌러 상단 조건에 맞는 활동 이력만 다시 불러옵니다."
        }
      ],
      notes: ["조회 기간이 길수록 이력 건수가 많아집니다. 기간을 먼저 좁히는 것이 중요합니다."],
      detailItems: [
        {
          title: "시작일 카드",
          description: "이력 범위의 시작점을 정해 오래된 로그를 먼저 제거합니다."
        },
        {
          title: "종료일 카드",
          description: "끝 날짜를 맞춰 이번 조사 범위를 완성합니다."
        },
        {
          title: "사용자 필터",
          description: "특정 계정만 추적하거나 전체를 유지할지 결정합니다."
        },
        {
          title: "액션 필터",
          description: "승인, 출력, 로그인 등 필요한 액션 유형만 남깁니다."
        },
        {
          title: "조회와 초기화 버튼",
          description: "조건을 적용하거나 초기 상태로 되돌리는 마지막 실행 영역입니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AccessHistoryGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="filters" />
      )
    },
    {
      id: "access-history-interpret",
      kind: "feature",
      navLabel: "이력 해석",
      title: "이력 테이블에서 처리시각, 사용자, 액션, 세부 내용으로 이상 행동을 판단합니다.",
      description:
        "각 이력 행에는 처리시각, 사용자 계정, 액션 유형, 대상 화면, 세부 내용이 기록되어 있습니다.",
      goal: "로그인 실패 반복, 비정상 시간대 고위험 액션 등 이상 징후를 먼저 찾고 필요하면 계정을 비활성화합니다.",
      steps: [
        {
          title: "처리시각과 사용자 확인",
          description: "언제, 누가 어떤 행동을 했는지 먼저 확인합니다."
        },
        {
          title: "액션과 세부 내용 읽기",
          description: "액션 유형과 세부 내용으로 어떤 처리가 이뤄졌는지 파악합니다."
        },
        {
          title: "이상 행동 식별 및 조치",
          description: "로그인 실패 반복이나 비정상 시간대 승인이 보이면 사용자 관리 탭에서 계정 상태를 확인합니다."
        }
      ],
      notes: [
        "이력은 읽기 전용입니다. 삭제하거나 수정할 수 없습니다.",
        "이상 행동 발견 시 사용자 계정을 비활성화하고 비밀번호를 초기화합니다."
      ],
      detailItems: [
        {
          title: "현재 필터 상태",
          description: "테이블을 읽기 전에 어떤 조건으로 이력이 추려졌는지 다시 확인합니다."
        },
        {
          title: "일반 승인 행",
          description: "정상 업무 흐름으로 보이는 승인 또는 출력 행을 기준선으로 읽습니다."
        },
        {
          title: "경고 행",
          description: "로그인 실패 같은 경고 행을 따로 읽어 즉시 조치가 필요한지 판단합니다."
        }
      ],
      renderFigure: ({ activeFocusIndex, activeTab }) => (
        <AccessHistoryGuideScene activeFocusIndex={activeFocusIndex} activeTab={activeTab} variant="interpret" />
      )
    }
  ]
};

const routeGuideRegistry: Partial<Record<RouteKey, RouteGuideDefinition>> = {
  dashboard: dashboardGuide,
  workforce: workforceGuide,
  sites: siteGuide,
  performance: performanceGuide,
  allowance: allowanceGuide,
  schedule: scheduleGuide,
  operations: operationsGuide,
  "access-history": accessHistoryGuide
};

export const getRouteGuide = (routeKey: RouteKey) => routeGuideRegistry[routeKey] ?? null;
