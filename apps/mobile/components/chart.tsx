import React from "react";
import { View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { useTheme } from "../theme";
import { Txt } from "./ui";
export function SalesChart({
  data,
}: {
  data: { date: string; amount: string }[];
}) {
  const c = useTheme();
  const values = data.map((d) => Number(d.amount));
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${10 + (i * 300) / Math.max(1, values.length - 1)} ${110 - (v / max) * 90}`,
    )
    .join(" ");
  return (
    <View accessibilityLabel={`Sales trend, ${data.length} days`}>
      <Svg width="100%" height={140} viewBox="0 0 320 140">
        {[20, 65, 110].map((y) => (
          <Line
            key={y}
            x1={0}
            x2={320}
            y1={y}
            y2={y}
            stroke={c.line}
            strokeDasharray="3 5"
          />
        ))}
        <Path
          d={points}
          fill="none"
          stroke={c.accent}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt muted size={11}>
          {data[0]?.date}
        </Txt>
        <Txt muted size={11}>
          {data.at(-1)?.date}
        </Txt>
      </View>
    </View>
  );
}
