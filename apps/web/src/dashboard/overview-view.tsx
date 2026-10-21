import type { ReadyState } from "../app/app-provider";
import { DonutChart } from "./donut-chart";
import { MonthlyBars } from "./monthly-bars";
import { RecentList } from "./recent-list";
import { Cards } from "./summary-view";
import type { SummaryData } from "./use-summary";

const card = "rounded-xl border border-line bg-surface p-4";

/**
 * The dense Home view: the totals strip, where it went, six months of income against spending, and
 * the latest Transactions. One column on a phone, two from a tablet up. Every figure comes from the
 * same report the other views read.
 */
export function OverviewView({ data, app }: { data: SummaryData; app: ReadyState }) {
  return (
    <div className="flex flex-col gap-4">
      <Cards data={data} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={card}>
          <DonutChart spending={data.spending} currency={data.currency} />
        </div>
        <div className={card}>
          <MonthlyBars monthly={data.monthly} currency={data.currency} />
        </div>
        <div className={`${card} md:col-span-2`}>
          <RecentList app={app} />
        </div>
      </div>
    </div>
  );
}
