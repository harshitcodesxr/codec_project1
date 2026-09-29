"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/plans";
import { EmptyState } from "@/components/ui";

export function RevenueChart({
  data,
}: {
  data: { month: string; mrrCents: number }[];
}) {
  const hasRevenue = data.some((d) => d.mrrCents > 0);

  if (!hasRevenue) {
    return <EmptyState>No paid invoices in this window yet.</EmptyState>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#23262e" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => `$${Math.round(v / 100)}`}
          />
          <Tooltip
            cursor={{ fill: "#23262e55" }}
            contentStyle={{
              background: "#161920",
              border: "1px solid #23262e",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(value) => [
              formatMoney(Number(value) || 0),
              "Collected",
            ]}
          />
          <Bar dataKey="mrrCents" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
