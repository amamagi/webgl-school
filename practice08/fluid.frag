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

vec4 jacobiSolver(vec2 uv){
    vec4 center = texture(u_initialTexture, uv);
    vec4 left   = texture(u_bufferTexture, uv + vec2(-1.0, 0.0) / u_resolution.xy);
    vec4 right  = texture(u_bufferTexture, uv + vec2(1.0, 0.0) / u_resolution.xy);
    vec4 up     = texture(u_bufferTexture, uv + vec2(0.0, 1.0) / u_resolution.xy);
    vec4 down   = texture(u_bufferTexture, uv + vec2(0.0, -1.0) / u_resolution.xy);
    return (left + right + up + down + center * u_centerFactor) * u_beta;
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    fragColor = vec4(jacobiSolver(uv).xyz, 1.0);
}