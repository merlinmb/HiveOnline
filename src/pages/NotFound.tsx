import { Link } from 'react-router-dom';
import { BugIcon } from '../components/BugIcon';

export default function NotFound() {
  return (
    <div className="page narrow-page">
      <div className="panel notfound-panel">
        <div className="notfound-icon">
          <BugIcon bug="ladybug" size={64} />
        </div>
        <div className="eyebrow">404</div>
        <h1>This path leads nowhere.</h1>
        <p>The tile you are looking for is not part of this hive.</p>
        <div className="button-row centered">
          <Link to="/lobby" className="btn btn-primary">
            Back to the lobby
          </Link>
          <Link to="/" className="btn btn-ghost">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
