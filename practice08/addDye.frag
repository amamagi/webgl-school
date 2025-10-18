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
uniform float u_effectScale;

void main(){
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec2 pixelPos = vec2(coord) / u_resolution;

    vec4 currentValue = texelFetch(u_bufferTexture, coord, 0);

    vec2 mouseVelocity = (u_currentMouse - u_previousMouse);
    float distanceToMouse = length(pixelPos - u_currentMouse);
    float effect = exp(-distanceToMouse * distanceToMouse / (u_effectRadius * u_effectRadius));

    vec4 newValue = currentValue + effect * u_effectScale * 100.0; // 効果を強調
    // newValue = clamp(newValue, 0.0, 1.0); // 制限

    fragColor = newValue;
}