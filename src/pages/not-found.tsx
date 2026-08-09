/**
 * An address this app does not own.
 *
 * The document this renders inside was served with a REAL 404: nginx.conf enumerates this app's
 * routes and everything else falls through to `error_page 404 /index.html`, which keeps the status
 * line honest while still serving the shell. So this screen and the HTTP status agree, and a crawler,
 * a link checker and a person all reach the same conclusion.
 *
 * That matters more here than on most surfaces. This site's whole job is to be findable by a stranger
 * looking for a pool to point hardware at, so it is indexed on purpose — and a bundle that answered
 * 200 for every path would offer a search engine an unbounded set of blank pages under this hostname.
 */
import { Link } from 'react-router-dom'
import { NAV } from '../lib/routes.ts'

export function NotFoundPage() {
  return (
    <div className="pl-page">
      <h1 className="pl-title">Page not found</h1>
      <p className="pl-lede">
        This address is not one of ours. The server said 404 as well as this screen, so a link checker
        and a person reach the same conclusion — and a missing page here says nothing about whether
        the pool itself is accepting connections.
      </p>
      <p>Everything this site does hold:</p>
      <ul className="pl-links">
        {NAV.map((item) => (
          <li key={item.to}>
            <Link to={item.to}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
