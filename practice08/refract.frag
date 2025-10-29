#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_velocityTexture; // float
uniform sampler2D u_colorTexture;    // vec4

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    vec2 velocity = texture(u_velocityTexture, uv).xy;
    uv += velocity * 20.0;

    uv = vec2(uv.x, 1.0 - uv.y); // テクスチャ座標系に変換
    vec4 color = texture(u_colorTexture, uv);


    fragColor = color;
}