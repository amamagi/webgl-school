#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_bufferTexture;


void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    fragColor = vec4(texture(u_bufferTexture, uv).rgb, 1.0);
}