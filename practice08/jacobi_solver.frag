#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor; // d_n

uniform float u_time;
uniform vec2 u_resolution;

uniform sampler2D u_initialTexture; // d_0
uniform sampler2D u_bufferTexture;  // d_n-1

uniform float u_centerFactor;
uniform float u_beta;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    vec2 center = texelFetch(u_initialTexture, ivec2(gl_FragCoord.xy), 0).xy;
    vec2 left   = texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy - vec2(1.0, 0.0)), 0).xy;
    vec2 right  = texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy + vec2(1.0, 0.0)), 0).xy;
    vec2 up     = texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy + vec2(0.0, 1.0)), 0).xy;
    vec2 down   = texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy - vec2(0.0, 1.0)), 0).xy;

    vec2 value = (left + right + up + down + (u_centerFactor * center)) * u_beta;
    fragColor = vec4(value, 0.0, 0.0);
}