interface ActionSpinnerProps {
    size?: number;
    tone?: 'primary' | 'inverted' | 'neutral';
}

const toneMap: Record<NonNullable<ActionSpinnerProps['tone']>, { ring: string; glow: string; dot: string }> = {
    primary: {
        ring: 'rgba(124, 124, 255, 0.9)',
        glow: 'rgba(124, 124, 255, 0.3)',
        dot: '#ffffff',
    },
    inverted: {
        ring: 'rgba(255, 255, 255, 0.92)',
        glow: 'rgba(255, 255, 255, 0.22)',
        dot: 'rgba(129, 140, 248, 0.95)',
    },
    neutral: {
        ring: 'rgba(255, 255, 255, 0.82)',
        glow: 'rgba(129, 140, 248, 0.22)',
        dot: '#c4b5fd',
    },
};

export function ActionSpinner({ size = 18, tone = 'primary' }: ActionSpinnerProps) {
    const palette = toneMap[tone];

    return (
        <span
            aria-hidden="true"
            className="action-spinner"
            style={{
                width: size,
                height: size,
                ['--spinner-ring' as string]: palette.ring,
                ['--spinner-glow' as string]: palette.glow,
                ['--spinner-dot' as string]: palette.dot,
                ['--spinner-core-size' as string]: `${Math.max(4, Math.round(size * 0.28))}px`,
            }}
        >
            <span className="action-spinner-ring" />
            <span className="action-spinner-core" />
        </span>
    );
}
