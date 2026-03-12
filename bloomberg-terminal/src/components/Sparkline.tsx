// Sparkline component using Recharts
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import type { SparkPoint } from "@/types";

interface Props {
  data: SparkPoint[];
  positive?: boolean;
  width?: number;
  height?: number;
}

export function Sparkline({ data, positive = true, width = 80, height = 28 }: Props) {
  if (!data?.length) return <div className="w-20 h-7 bg-white/5 rounded" />;
  const color = positive ? "#00FF88" : "#FF3355";
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone" dataKey="value" stroke={color}
          dot={false} strokeWidth={1.5} isAnimationActive={false}
        />
        <Tooltip
          content={<></>}
          wrapperStyle={{ display: "none" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
