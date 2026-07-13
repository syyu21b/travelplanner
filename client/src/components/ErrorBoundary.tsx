import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

// 기기/브라우저마다 localStorage에 저장된 데이터의 형태가 달라 특정 데이터에서만
// 재현되는 크래시가 있을 수 있음 — "새로고침"만으로는 같은 오류가 반복되므로
// 로컬 데이터를 초기화하고 다시 시도할 수 있는 탈출구를 제공
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  handleResetData = () => {
    const confirmed = window.confirm(
      "저장된 여행 계획, 기록, 로그인 정보가 모두 삭제됩니다. 계속할까요?"
    );
    if (!confirmed) return;
    try {
      localStorage.clear();
    } catch {
      // 무시 — 아래 reload는 그대로 시도
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2">예상치 못한 오류가 발생했습니다.</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              새로고침으로 해결되지 않는다면, 저장된 데이터가 손상되었을 수 있습니다.
            </p>

            <div className="flex items-center gap-2 mb-6">
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <RotateCcw size={16} />
                새로고침
              </button>
              <button
                onClick={this.handleResetData}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40",
                  "text-destructive hover:bg-destructive/10 cursor-pointer"
                )}
              >
                <Trash2 size={16} />
                데이터 초기화 후 재시도
              </button>
            </div>

            <button
              onClick={() => this.setState(s => ({ ...s, showDetails: !s.showDetails }))}
              className="text-xs text-muted-foreground underline mb-2"
            >
              {this.state.showDetails ? "오류 상세 숨기기" : "오류 상세 보기"}
            </button>
            {this.state.showDetails && (
              <div className="p-4 w-full rounded bg-muted overflow-auto">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {this.state.error?.stack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
