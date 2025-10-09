from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse

from openhands.app_server.config import user_injector as _user_injector
from openhands.app_server.user.user_context import UserContext
from openhands.core.logger import openhands_logger as logger
from openhands.integrations.service_types import (
    AuthenticationError,
    Branch,
    PaginatedBranchesResponse,
    ProviderType,
    Repository,
    SuggestedTask,
    UnknownException,
    User,
)
from openhands.microagent.types import (
    MicroagentContentResponse,
    MicroagentResponse,
)
from openhands.server.dependencies import get_dependencies
from openhands.server.shared import server_config

USER_CONTEXT_DEP = _user_injector()

app = APIRouter(prefix='/api/user', dependencies=get_dependencies())


@app.get('/installations', response_model=list[str])
async def get_user_installations(
    provider: ProviderType,
    user: UserContext = Depends(USER_CONTEXT_DEP),
):
    handler = await user.get_provider_handler()

    if provider == ProviderType.GITHUB:
        return await handler.get_github_installations()
    elif provider == ProviderType.BITBUCKET:
        return await handler.get_bitbucket_workspaces()
    else:
        return JSONResponse(
            content=f"Provider {provider} doesn't support installations",
            status_code=status.HTTP_400_BAD_REQUEST,
        )


@app.get('/repositories', response_model=list[Repository])
async def get_user_repositories(
    sort: str = 'pushed',
    selected_provider: ProviderType | None = None,
    page: int | None = None,
    per_page: int | None = None,
    installation_id: str | None = None,
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> list[Repository] | JSONResponse:
    handler = await user.get_provider_handler()
    try:
        return await handler.get_repositories(
            sort,
            server_config.app_mode,
            selected_provider,
            page,
            per_page,
            installation_id,
        )

    except UnknownException as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@app.get('/info', response_model=User)
async def get_user(
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> User | JSONResponse:
    handler = await user.get_provider_handler()

    try:
        return await handler.get_user()
    except UnknownException as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@app.get('/search/repositories', response_model=list[Repository])
async def search_repositories(
    query: str,
    per_page: int = 5,
    sort: str = 'stars',
    order: str = 'desc',
    selected_provider: ProviderType | None = None,
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> list[Repository] | JSONResponse:
    handler = await user.get_provider_handler(strict=False)
    try:
        repos: list[Repository] = await handler.search_repositories(
            selected_provider, query, per_page, sort, order
        )
        return repos

    except UnknownException as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@app.get('/search/branches', response_model=list[Branch])
async def search_branches(
    repository: str,
    query: str,
    per_page: int = 30,
    selected_provider: ProviderType | None = None,
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> list[Branch] | JSONResponse:
    handler = await user.get_provider_handler(strict=False)
    try:
        branches: list[Branch] = await handler.search_branches(
            selected_provider, repository, query, per_page
        )
        return branches

    except AuthenticationError as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    except UnknownException as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@app.get('/suggested-tasks', response_model=list[SuggestedTask])
async def get_suggested_tasks(
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> list[SuggestedTask] | JSONResponse:
    """Get suggested tasks for the authenticated user across their most recently pushed repositories.

    Returns:
    - PRs owned by the user
    - Issues assigned to the user.
    """
    handler = await user.get_provider_handler()
    try:
        tasks: list[SuggestedTask] = await handler.get_suggested_tasks()
        return tasks

    except UnknownException as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@app.get('/repository/branches', response_model=PaginatedBranchesResponse)
async def get_repository_branches(
    repository: str,
    page: int = 1,
    per_page: int = 30,
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> PaginatedBranchesResponse | JSONResponse:
    """Get branches for a repository.

    Args:
        repository: The repository name in the format 'owner/repo'
        page: Page number for pagination (default: 1)
        per_page: Number of branches per page (default: 30)

    Returns:
        A paginated response with branches for the repository
    """
    handler = await user.get_provider_handler(strict=False)
    try:
        branches_response: PaginatedBranchesResponse = await handler.get_branches(
            repository, page=page, per_page=per_page
        )
        return branches_response

    except UnknownException as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _extract_repo_name(repository_name: str) -> str:
    """Extract the actual repository name from the full repository path.

    Args:
        repository_name: Repository name in format 'owner/repo' or 'domain/owner/repo'

    Returns:
        The actual repository name (last part after the last '/')
    """
    return repository_name.split('/')[-1]


@app.get(
    '/repository/{repository_name:path}/microagents',
    response_model=list[MicroagentResponse],
)
async def get_repository_microagents(
    repository_name: str,
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> list[MicroagentResponse] | JSONResponse:
    """Scan the microagents directory of a repository and return the list of microagents.

    The microagents directory location depends on the git provider and actual repository name:
    - If git provider is not GitLab and actual repository name is ".openhands": scans "microagents" folder
    - If git provider is GitLab and actual repository name is "openhands-config": scans "microagents" folder
    - Otherwise: scans ".openhands/microagents" folder

    Note: This API returns microagent metadata without content for performance.
    Use the separate content API to fetch individual microagent content.

    Args:
        repository_name: Repository name in the format 'owner/repo' or 'domain/owner/repo'
        provider_tokens: Provider tokens for authentication
        access_token: Access token for external authentication
        user_id: User ID for authentication

    Returns:
        List of microagents found in the repository's microagents directory (without content)
    """
    try:
        # Create provider handler for API authentication
        provider_handler = await user.get_provider_handler(strict=False)

        # Fetch microagents using the provider handler
        microagents = await provider_handler.get_microagents(repository_name)

        logger.info(f'Found {len(microagents)} microagents in {repository_name}')
        return microagents

    except AuthenticationError:
        raise

    except RuntimeError as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    except Exception as e:
        logger.error(
            f'Error scanning repository {repository_name}: {str(e)}', exc_info=True
        )
        return JSONResponse(
            content=f'Error scanning repository: {str(e)}',
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@app.get(
    '/repository/{repository_name:path}/microagents/content',
    response_model=MicroagentContentResponse,
)
async def get_repository_microagent_content(
    repository_name: str,
    file_path: str = Query(
        ..., description='Path to the microagent file within the repository'
    ),
    user: UserContext = Depends(USER_CONTEXT_DEP),
) -> MicroagentContentResponse | JSONResponse:
    """Fetch the content of a specific microagent file from a repository.

    Args:
        repository_name: Repository name in the format 'owner/repo' or 'domain/owner/repo'
        file_path: Query parameter - Path to the microagent file within the repository
        provider_tokens: Provider tokens for authentication
        access_token: Access token for external authentication
        user_id: User ID for authentication

    Returns:
        Microagent file content and metadata

    Example:
        GET /api/user/repository/owner/repo/microagents/content?file_path=.openhands/microagents/my-agent.md
    """
    try:
        # Create provider handler for API authentication
        provider_handler = await user.get_provider_handler(strict=False)

        # Fetch file content using the provider handler
        response = await provider_handler.get_microagent_content(
            repository_name, file_path
        )

        logger.info(
            f'Retrieved content for microagent {file_path} from {repository_name}'
        )

        return response

    except AuthenticationError:
        raise

    except RuntimeError as e:
        return JSONResponse(
            content=str(e),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    except Exception as e:
        logger.error(
            f'Error fetching microagent content from {repository_name}/{file_path}: {str(e)}',
            exc_info=True,
        )
        return JSONResponse(
            content=f'Error fetching microagent content: {str(e)}',
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
