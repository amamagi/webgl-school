#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_pressureTexture;
uniform sampler2D u_velocityTexture;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 texelSize = 1.0 / u_resolution.xy;

    // 圧力の勾配を計算
    float divX = (texture(u_pressureTexture, uv - vec2(texelSize.x, 0.0)).x
                - texture(u_pressureTexture, uv + vec2(texelSize.x, 0.0)).x) 
                / (texelSize.x * 2.0);
    float divY = (texture(u_pressureTexture, uv - vec2(0.0, texelSize.y)).x
                - texture(u_pressureTexture, uv + vec2(0.0, texelSize.y)).x)
                / (texelSize.y * 2.0);

    vec2 velocity = texture(u_velocityTexture, uv).xy * 2.0 - 1.0; // [0, 1] -> [-1, 1]

    // 減算して発散を除去
    velocity -= vec2(divX, divY);

    // 速度をテクスチャに収めるために[0, 1]に戻す
    velocity = (velocity + 1.0) / 2.0; // [-1, 1] -> [0, 1]
    fragColor = vec4(velocity, 0.0, 0.0);
}