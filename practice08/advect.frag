#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;

uniform sampler2D u_velocityTexture;
uniform sampler2D u_textureToAdvect;
uniform float u_dissipationFactor;
uniform float u_deltaTime;

void main(){
    // v_new[x] = v[x - v[x] * dt]

    // sample velocity
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec2 velocity = texelFetch(u_velocityTexture, coord, 0).xy;
    vec2 texelSize = 1.0 / u_resolution.xy;

    // sample source coord
    vec2 sourceCoord = gl_FragCoord.xy - velocity * u_deltaTime / texelSize;
    // vec2 weight = fract(sourceCoord);
    // ivec2 baseCoord = ivec2(floor(sourceCoord));
    // vec2 v00 = texelFetch(u_textureToAdvect, baseCoord, 0).xy;
    vec2 v00 = texture(u_textureToAdvect, sourceCoord * texelSize).xy;

    // bilinear interpolation - direct float texture reads
    // vec2 v10 = texelFetch(u_textureToAdvect, baseCoord + ivec2(1, 0), 0).xy;
    // vec2 v01 = texelFetch(u_textureToAdvect, baseCoord + ivec2(0, 1), 0).xy;
    // vec2 v11 = texelFetch(u_textureToAdvect, baseCoord + ivec2(1, 1), 0).xy;
    // vec2 value = mix(mix(v00, v10, weight.x), mix(v01, v11, weight.x), weight.y);
    vec2 value = v00; // nearest neighbor for simplicity

    // dissipation
    value = value * u_dissipationFactor;

    // direct output - no compression needed for float textures
    fragColor = vec4(value, 0.0, 1.0);
}