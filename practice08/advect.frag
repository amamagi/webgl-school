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
    vec2 texelSize = 1.0 / u_resolution.xy;

    vec2 velocity = texture(u_velocityTexture, uv).xy * 2.0 - 1.0; // [0, 1] -> [-1, 1]

    vec2 currentValue = texture(u_textureToAdvect, uv).xy;
    vec2 offset = velocity * u_deltaTime * texelSize;
    vec2 prevValue = texture(u_textureToAdvect, clamp(uv - offset, 0.0, 1.0)).xy;

    fragColor = vec4(prevValue * u_dissipationFactor + currentValue * (1.0 - u_dissipationFactor), 0.0, 0.0);
}