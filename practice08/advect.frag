#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_textureToAdvect;
uniform float u_dissipationFactor;
uniform float u_deltaTime;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    vec2 oldValue = texture(u_textureToAdvect, uv).xy;
    
    vec2 velocity = texture(u_velocityTexture, uv).xy * 2.0 - 1.0;
    vec2 newUV = uv - velocity * u_deltaTime / u_resolution;
    newUV = clamp(newUV, vec2(0.0), vec2(1.0));

    vec2 newValue = texture(u_textureToAdvect, newUV).xy;

    fragColor = vec4(newValue * u_dissipationFactor, 0.0, 1.0);
}