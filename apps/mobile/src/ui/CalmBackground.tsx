import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

/**
 * A slow, calming moving background: soft teal, lavender and warm glows drifting over a deep
 * blue-green gradient, like a looping ambient video, but drawn live by the GPU (no video file,
 * sharp at any size). Each glow takes over a minute to wander, so the motion is felt more than
 * seen. With reduced motion it is a still frame.
 */
const EFFECT = Skia.RuntimeEffect.Make(`
uniform float2 res;
uniform float t;

float glow(float2 uv, float2 c, float r) {
  float d = length(uv - c);
  return 1.0 - smoothstep(0.0, r, d);
}

half4 main(float2 pos) {
  float ar = res.x / res.y;
  float2 uv = pos / res.y;
  float3 col = mix(float3(0.06, 0.09, 0.18), float3(0.04, 0.16, 0.20), pos.y / res.y);

  float2 c1 = float2(ar * (0.30 + 0.20 * sin(t * 0.11)), 0.28 + 0.12 * cos(t * 0.09));
  float2 c2 = float2(ar * (0.72 + 0.18 * cos(t * 0.07)), 0.60 + 0.15 * sin(t * 0.10));
  float2 c3 = float2(ar * (0.50 + 0.25 * sin(t * 0.05 + 1.7)), 0.88 + 0.08 * cos(t * 0.12));
  col += glow(uv, c1, 0.60) * float3(0.16, 0.42, 0.45) * 0.55;
  col += glow(uv, c2, 0.55) * float3(0.38, 0.30, 0.58) * 0.45;
  col += glow(uv, c3, 0.50) * float3(0.58, 0.40, 0.30) * 0.30;
  // A faint, slow sheen so the light seems to breathe.
  col += 0.025 * sin(uv.x * 4.0 + t * 0.20 + sin(uv.y * 3.0 + t * 0.15));
  return half4(half3(col), 1.0);
}
`)!;

export function CalmBackground({ animate = true }: { animate?: boolean }) {
  const { width, height } = useWindowDimensions();
  const clock = useClock();
  // A fixed moment when still, chosen so the glows are nicely spread.
  const uniforms = useDerivedValue(() => ({ res: [width, height], t: animate ? 12 + clock.value / 1000 : 12 }));
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={EFFECT} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
