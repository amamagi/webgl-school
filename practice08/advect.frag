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

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    vec2 velocity = texelFetch(u_velocityTexture, ivec2(uv * u_resolution.xy), 0).xy * 2.0 - 1.0; // [0, 1] -> [-1, 1]
    vec2 offset = velocity * u_deltaTime / u_resolution.xy; // 速度に基づくオフセット計算
    uv = clamp(uv - offset, vec2(0.0), vec2(1.0));

    // 複数のテクセルをサンプリングして補間したいので、texture()を使う
    vec2 sourceVelocity = texture(u_textureToAdvect, uv).xy;

    fragColor = vec4(sourceVelocity * u_dissipationFactor, 0.0, 0.0);
}