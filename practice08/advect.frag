#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_textureToAdvect;
uniform sampler2D u_velocityTexture;
uniform float u_dissipationFactor;
uniform float u_deltaTime;

// FIXME: ベクトルの衝突境界でエネルギー保存則が破られている
// FIXME: 8方向に制限されてしまう
void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec2 velocity = texelFetch(u_velocityTexture, coord, 0).xy * 2.0 - 1.0; // [0, 1] -> [-1, 1]

    velocity = mix(velocity, vec2(0.0), step(length(velocity), 0.01)); // 小さい速度は無視0; // [0, 1] -> [-1, 1]
    vec2 offset = velocity * u_deltaTime;

    uv = uv - offset;

    // 複数のテクセルをサンプリングして補間したいので、texture()を使う
    vec2 sourceVelocity = texture(u_textureToAdvect, uv).xy;

    sourceVelocity = sourceVelocity * 2.0 - 1.0; // [0, 1] -> [-1, 1]
    sourceVelocity = sourceVelocity * u_dissipationFactor; // 減衰
    sourceVelocity = (sourceVelocity + 1.0) * 0.5; // [-1, 1] -> [0, 1]

    fragColor = vec4(sourceVelocity, 0.0, 0.0);
}