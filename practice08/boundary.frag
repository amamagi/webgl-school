#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bufferTexture;
uniform float u_scale;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 texelSize = 1.0 / u_resolution.xy;
    vec2 offset = uv.x < texelSize.x ? vec2(texelSize.x, 0.0)        // 左
                : uv.x > 1.0 - texelSize.x ? vec2(-texelSize.x, 0.0) // 右
                : uv.y < texelSize.y ? vec2(0.0, texelSize.y)        // 上
                : uv.y > 1.0 - texelSize.y ? vec2(0.0, -texelSize.y) // 下
                : vec2(0.0);
    float scale = offset == vec2(0.0) ? 1.0 : u_scale;
    vec2 value = texture(u_bufferTexture, uv + offset).xy;
    value = value * 2.0 - 1.0; // [0, 1] -> [-1, 1]
    value = value * scale;
    value = (value + 1.0) / 2.0; // [-1, 1] -> [0, 1]
    fragColor = vec4(value, 0.0, 0.0);
}