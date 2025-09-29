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

    vec4 currentValue = texture(u_bufferTexture, uv);

    vec2 mouseVelocity = (u_currentMouse - u_previousMouse);
    float distanceToMouse = length(uv - u_currentMouse);
    float effect = exp(-distanceToMouse * distanceToMouse / (u_effectRadius * u_effectRadius));

    vec4 newValue = currentValue + effect * 5.0; // 効果を強調
    newValue = clamp(newValue, 0.0, 1.0); // 制限

    fragColor = newValue;
}