import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationCircle } from '@fortawesome/free-solid-svg-icons';

const ErrorMessage = ({ error }) => {
  if (!error) return null;
  
  return (
    <div className="flex items-center mt-1 text-red-600 text-sm">
      <FontAwesomeIcon icon={faExclamationCircle} className="mr-1" />
      <span>{error}</span>
    </div>
  );
};

export default ErrorMessage;