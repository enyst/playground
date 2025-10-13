from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse

from openhands.app_server.config import depends_user_context
from openhands.app_server.user.user_context import UserContext
from openhands.integrations.service_types import (
    Branch,
    PaginatedBranchesResponse,
    ProviderType,
    Repository,
    SuggestedTask,
    User,
)
from openhands.microagent.types import (
    MicroagentContentResponse,
    MicroagentResponse,
)
from openhands.server.dependencies import get_dependencies
from openhands.server.shared import server_config

saas_user_router = APIRouter(prefix='/api/user', dependencies=get_dependencies())


@saas_user_router.get('/installations', response_model=list[str])
async def saas_get_user_installations(
    provider: ProviderType,
    user: UserContext = Depends(depends_user_context()),
):
    handler = await user.get_provider_handler()
    if provider == ProviderType.GITHUB:
        return await handler.get_github_installations()
    if provider == ProviderType.BITBUCKET:
        return await handler.get_bitbucket_workspaces()
    return JSONResponse(
        content=f"Provider {provider} doesn't support installations",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


@saas_user_router.get('/repositories', response_model=list[Repository])
async def saas_get_user_repositories(
    sort: str = 'pushed',
    selected_provider: ProviderType | None = None,
    page: int | None = None,
    per_page: int | None = None,
    installation_id: str | None = None,
    user: UserContext = Depends(depends_user_context()),
) -> list[Repository] | JSONResponse:
    handler = await user.get_provider_handler()
    try:
        return await handler.get_repositories(
            sort, server_config.app_mode, selected_provider, page, per_page, installation_id
        )
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@saas_user_router.get('/info', response_model=User)
async def saas_get_user(user: UserContext = Depends(depends_user_context())) -> User | JSONResponse:
    handler = await user.get_provider_handler()
    try:
        return await handler.get_user()
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@saas_user_router.get('/search/repositories', response_model=list[Repository])
async def saas_search_repositories(
    query: str,
    per_page: int = 5,
    sort: str = 'stars',
    order: str = 'desc',
    selected_provider: ProviderType | None = None,
    user: UserContext = Depends(depends_user_context()),
) -> list[Repository] | JSONResponse:
    handler = await user.get_provider_handler()
    try:
        repos = await handler.search_repositories(selected_provider, query, per_page, sort, order)
        return repos
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@saas_user_router.get('/suggested-tasks', response_model=list[SuggestedTask])
async def saas_get_suggested_tasks(
    user: UserContext = Depends(depends_user_context()),
) -> list[SuggestedTask] | JSONResponse:
    handler = await user.get_provider_handler()
    try:
        tasks = await handler.get_suggested_tasks()
        return tasks
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@saas_user_router.get('/repository/branches', response_model=PaginatedBranchesResponse)
async def saas_get_repository_branches(
    repository: str,
    page: int = 1,
    per_page: int = 30,
    user: UserContext = Depends(depends_user_context()),
) -> PaginatedBranchesResponse | JSONResponse:
    handler = await user.get_provider_handler()
    try:
        branches = await handler.get_branches(repository, page=page, per_page=per_page)
        return branches
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@saas_user_router.get('/search/branches', response_model=list[Branch])
async def saas_search_branches(
    repository: str,
    query: str,
    per_page: int = 30,
    selected_provider: ProviderType | None = None,
    user: UserContext = Depends(depends_user_context()),
) -> list[Branch] | JSONResponse:
    handler = await user.get_provider_handler()
    try:
        branches = await handler.search_branches(selected_provider, repository, query, per_page)
        return branches
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@saas_user_router.get(
    '/repository/{repository_name:path}/microagents',
    response_model=list[MicroagentResponse],
)
async def saas_get_repository_microagents(
    repository_name: str,
    user: UserContext = Depends(depends_user_context()),
) -> list[MicroagentResponse] | JSONResponse:
    try:
        handler = await user.get_provider_handler()
        microagents = await handler.get_microagents(repository_name)
        return microagents
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@saas_user_router.get(
    '/repository/{repository_name:path}/microagents/content',
    response_model=MicroagentContentResponse,
)
async def saas_get_repository_microagent_content(
    repository_name: str,
    file_path: str = Query(
        ..., description='Path to the microagent file within the repository'
    ),
    user: UserContext = Depends(depends_user_context()),
) -> MicroagentContentResponse | JSONResponse:
    try:
        handler = await user.get_provider_handler()
        response = await handler.get_microagent_content(repository_name, file_path)
        return response
    except Exception as e:
        return JSONResponse(content=str(e), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


