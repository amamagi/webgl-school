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
uniform float u_scale;
uniform float u_offset;

vec2 restoreVector(vec2 texValue) {
    return texValue * u_scale * 2.0 - u_offset; // [0, 1] -> [-vs, vs]
}

vec2 compressVector(vec2 rawValue) {
    return (rawValue + u_offset) / (u_scale * 2.0); // [-vs, vs] -> [0, 1]
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 texelSize = 1.0 / u_resolution.xy;

    vec2 center = restoreVector(texelFetch(u_initialTexture, ivec2(gl_FragCoord.xy), 0).xy);
    vec2 left   = restoreVector(texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy - vec2(1.0, 0.0)), 0).xy);
    vec2 right  = restoreVector(texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy + vec2(1.0, 0.0)), 0).xy);
    vec2 up     = restoreVector(texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy + vec2(0.0, 1.0)), 0).xy);
    vec2 down   = restoreVector(texelFetch(u_bufferTexture, ivec2(gl_FragCoord.xy - vec2(0.0, 1.0)), 0).xy);

    vec2 value = (left + right + up + down + center * u_centerFactor) * u_beta;
    value = compressVector(value); // [-u_offset, u_offset] -> [0, 1]
    fragColor = vec4(value, 0.0, 0.0);
}