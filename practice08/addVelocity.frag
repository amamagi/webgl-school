#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
uniform vec2 u_previousMouse;
uniform vec2 u_currentMouse;
uniform float u_effectRadius;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 texelSize = 1.0 / u_resolution.xy;

    vec2 currentVelocity = texture(u_bufferTexture, uv).xy * 2.0 - 1.0; // [0, 1] -> [-1, 1]

    vec2 mouseVelocity = (u_currentMouse - u_previousMouse);
    float distanceToMouse = length(uv - u_currentMouse);
    float effect = exp(-distanceToMouse * distanceToMouse / (u_effectRadius * u_effectRadius));

    vec2 newVelocity = currentVelocity + mouseVelocity * effect * 5.0; // 効果を強調
    newVelocity = clamp(newVelocity, -1.0, 1.0); // 制限
    newVelocity = (newVelocity + 1.0) / 2.0; // [-1, 1] -> [0, 1]

    fragColor = vec4(newVelocity, 0.0, 0.0);
}