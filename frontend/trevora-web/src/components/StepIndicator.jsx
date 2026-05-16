const steps = ['Select Vehicle', 'Choose Input Method', 'Create Draft'];

export default function StepIndicator({ currentStep = 3 }) {
  return (
    <ol className="step-indicator" aria-label="Service input progress">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const status = stepNumber < currentStep ? 'complete' : stepNumber === currentStep ? 'current' : 'upcoming';

        return (
          <li className={status} key={step}>
            <span>{stepNumber}</span>
            <strong>{step}</strong>
          </li>
        );
      })}
    </ol>
  );
}
