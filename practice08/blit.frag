#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;


void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    fragColor = texture(u_bufferTexture, uv);
}