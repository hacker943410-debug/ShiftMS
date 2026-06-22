import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
// Pretendard 가변 글꼴을 앱에 직접 포함(오프라인에서도 동작). styles.css가 이미
// "Pretendard Variable"을 요청하지만 실제 글꼴은 로드되지 않아 대체 글꼴로 보였음.
import "pretendard/dist/web/variable/pretendardvariable.css";
// Material Symbols(아웃라인) 글꼴도 앱에 직접 포함(오프라인 동작). 시안과 동일한
// 아이콘 글리프를 화면에서 그대로 사용하기 위함.
import "material-symbols/outlined.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
