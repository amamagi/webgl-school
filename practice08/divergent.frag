#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float partialXY = 2.0 / u_resolution.x; // assuming x and y resolutions are the same
    vec4 left   = texture(u_bufferTexture, uv + vec2(-1.0, 0.0) / u_resolution.xy);
    vec4 right  = texture(u_bufferTexture, uv + vec2(1.0, 0.0) / u_resolution.xy);
    vec4 up     = texture(u_bufferTexture, uv + vec2(0.0, 1.0) / u_resolution.xy);
    vec4 down   = texture(u_bufferTexture, uv + vec2(0.0, -1.0) / u_resolution.xy);
    fragColor = vec4((right.x - left.x + up.y - down.y) / partialXY);
}