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

vec2 sampleVelocity(sampler2D buffer, ivec2 coord) {
    return texelFetch(u_velocityTexture, coord, 0).xy;
}

void main(){
    // v_new[x] = v[x - v[x] * dt]

    // sample velocity
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec2 velocity = sampleVelocity(u_velocityTexture, coord);
    
    // sample source coord
    vec2 sourceCoord = gl_FragCoord.xy - velocity * u_deltaTime;
    vec2 weight = fract(sourceCoord);
    ivec2 baseCoord = ivec2(floor(sourceCoord));

    // bilinear interpolation - direct float texture reads
    vec2 v00 = texelFetch(u_textureToAdvect, baseCoord, 0).xy;
    vec2 v10 = texelFetch(u_textureToAdvect, baseCoord + ivec2(1, 0), 0).xy;
    vec2 v01 = texelFetch(u_textureToAdvect, baseCoord + ivec2(0, 1), 0).xy;
    vec2 v11 = texelFetch(u_textureToAdvect, baseCoord + ivec2(1, 1), 0).xy;
    vec2 value = mix(mix(v00, v10, weight.x), mix(v01, v11, weight.x), weight.y);

    // dissipation
    value = value * u_dissipationFactor;
    value = mix(vec2(0.0), value, step(1.0, length(value)));

    // direct output - no compression needed for float textures
    fragColor = vec4(value, 0.0, 1.0);
}