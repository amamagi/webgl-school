#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
uniform sampler2D u_initialTexture;
uniform float u_centerFactor;
uniform float u_beta;
uniform float u_scale;
uniform float u_offset;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 texelSize = 1.0 / u_resolution.xy;

    vec2 center = texture(u_initialTexture, uv).xy * u_scale - u_offset;
    vec2 left   = texture(u_bufferTexture, uv - vec2(texelSize.x, 0.0)).xy * u_scale - u_offset;
    vec2 right  = texture(u_bufferTexture, uv + vec2(texelSize.x, 0.0)).xy * u_scale - u_offset;
    vec2 up     = texture(u_bufferTexture, uv + vec2(0.0, texelSize.y)).xy * u_scale - u_offset;
    vec2 down   = texture(u_bufferTexture, uv - vec2(0.0, texelSize.y)).xy * u_scale - u_offset;

    vec2 value = (left + right + up + down + center * u_centerFactor) * u_beta;
    fragColor = vec4((value + u_offset) / u_scale, 0.0, 0.0);
}