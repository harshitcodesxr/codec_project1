"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsagePoint } from "@/lib/usage";
import { EmptyState } from "@/components/ui";

const toNumber = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export function UsageChart({ data }: { data: UsagePoint[] }) {
  const hasTraffic = data.some((d) => toNumber(d.api_calls) > 0);

  if (!hasTraffic) {
    return <EmptyState>No API calls recorded in this window yet.</EmptyState>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="apiFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#23262e" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
          />
          <Tooltip
            contentStyle={{
              background: "#161920",
              border: "1px solid #23262e",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(value) => [toNumber(value).toLocaleString(), "API calls"]}
          />
          <Area
            type="monotone"
            dataKey="api_calls"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#apiFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
