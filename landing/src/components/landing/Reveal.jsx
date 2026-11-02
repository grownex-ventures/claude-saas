import { motion, useReducedMotion } from "framer-motion";

export const Reveal = ({ children, delay = 0, y = 24, className = "", as = "div" }) => {
    const reduce = useReducedMotion();
    const MotionTag = motion[as] || motion.div;
    return (
        <MotionTag
            className={className}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </MotionTag>
    );
};

export default Reveal;
